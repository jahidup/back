const express = require('express');
const db = require('../db');
const { generateToken, shuffleArray } = require('../utils/helpers');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// In-memory token store (for production use Redis or JWT)
const tokenStore = new Map();

function verifyToken(token) {
  const data = tokenStore.get(token);
  if (!data) return null;
  if (Date.now() > data.exp) {
    tokenStore.delete(token);
    return null;
  }
  return data.studentId;
}

// Helper to send email
async function sendEmail(to, subject, text) {
  if (!to) return;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  await transporter.sendMail({ to, subject, text });
}

// Main handler
router.post('/', async (req, res) => {
  const { action, token, ...params } = req.body;
  
  try {
    switch (action) {
      case 'login': return handleLogin(params, res);
      case 'sendUnblockRequest': return handleSendUnblockRequest(params, res);
      case 'getStudentDashboard': return handleGetStudentDashboard(token, res);
      case 'getAvailableTests': return handleGetAvailableTests(token, res);
      case 'getTest': return handleGetTest(token, params, res);
      case 'getQuestions': return handleGetQuestions(token, params, res);
      case 'submitAnswer': return handleSubmitAnswer(token, params, res);
      case 'submitTest': return handleSubmitTest(token, params, res);
      case 'getStudentResults': return handleGetStudentResults(token, res);
      case 'getTestAnalysis': return handleGetTestAnalysis(token, params, res);
      case 'getDiscussions': return handleGetDiscussions(token, params, res);
      case 'getMessages': return handleGetMessages(token, res);
      case 'sendMessage': return handleSendMessage(token, params, res);
      case 'checkBlocked': return handleCheckBlocked(token, res);
      case 'getAllTestNames': return handleGetAllTestNames(token, res);
      case 'getToppers': return handleGetToppers(token, params, res);
      case 'getTestParticipants': return handleGetTestParticipants(token, params, res);
      default: return res.json({ status: 'error', data: 'Unknown student action' });
    }
  } catch (err) {
    console.error(err);
    res.json({ status: 'error', data: err.message });
  }
});

// ---------- Implementation of each handler ----------
async function handleLogin({ id, dob }, res) {
  if (!id || !dob || dob.length !== 8) return res.json({ status: 'error', data: 'Invalid input' });
  const [rows] = await db.query('SELECT * FROM students WHERE id = ? AND dob = ?', [id, dob]);
  if (rows.length === 0) return res.json({ status: 'error', data: 'Invalid ID/DOB' });
  const [blocked] = await db.query('SELECT * FROM blocked WHERE studentId = ?', [id]);
  if (blocked.length) return res.json({ status: 'blocked', data: { reason: blocked[0].reason } });
  const token = generateToken();
  tokenStore.set(token, { studentId: id, exp: Date.now() + 8 * 60 * 60 * 1000 });
  res.json({ status: 'success', data: { name: rows[0].name, id: rows[0].id }, token });
}

async function handleSendUnblockRequest({ id, dob, reason }, res) {
  const [rows] = await db.query('SELECT * FROM students WHERE id = ? AND dob = ?', [id, dob]);
  if (rows.length === 0) return res.json({ status: 'error', data: 'Invalid credentials' });
  const messageId = uuidv4();
  const text = `Student ${id} requests to be unblocked. Reason: ${reason || 'No reason provided'}`;
  await db.query(
    'INSERT INTO messages (messageId, studentId, sender, text, attachments, timestamp, type) VALUES (?,?,?,?,?,NOW(),?)',
    [messageId, id, 'student', text, '[]', 'unblock_request']
  );
  res.json({ status: 'success', data: 'Request sent to admin' });
}

async function handleGetStudentDashboard(token, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [rows] = await db.query('SELECT * FROM students WHERE id = ?', [studentId]);
  if (rows.length === 0) return res.json({ status: 'error', data: 'Student not found' });
  const s = rows[0];
  res.json({ status: 'success', data: { id: s.id, name: s.name, dob: s.dob, class: s.class, mobile: s.mobile, email: s.email, registered: s.registered_on } });
}

async function handleGetAvailableTests(token, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [tests] = await db.query('SELECT * FROM tests');
  const [taken] = await db.query('SELECT testId FROM results WHERE studentId = ?', [studentId]);
  const takenIds = new Set(taken.map(t => t.testId));
  const available = tests.filter(t => !takenIds.has(t.testId));
  res.json({ status: 'success', data: available });
}

async function handleGetTest(token, { testId }, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [testRow] = await db.query('SELECT * FROM tests WHERE testId = ?', [testId]);
  if (testRow.length === 0) return res.json({ status: 'error', data: 'Test not found' });
  const test = testRow[0];
  const [questions] = await db.query('SELECT * FROM questions WHERE testId = ?', [testId]);
  if (test.shuffle === 'TRUE') shuffleArray(questions);
  res.json({ status: 'success', data: { ...test, questions } });
}

async function handleGetQuestions(token, { testId }, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [questions] = await db.query('SELECT * FROM questions WHERE testId = ?', [testId]);
  res.json({ status: 'success', data: questions });
}

async function handleSubmitAnswer(token, { testId, qId, selected }, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [qRow] = await db.query('SELECT correct FROM questions WHERE qId = ? AND testId = ?', [qId, testId]);
  const correct = qRow.length ? qRow[0].correct : null;
  const isCorrect = (selected == correct);
  const responseId = uuidv4();
  await db.query(
    'INSERT INTO responses (responseId, studentId, testId, qId, selected, isCorrect, timestamp) VALUES (?,?,?,?,?,?,NOW())',
    [responseId, studentId, testId, qId, selected, isCorrect]
  );
  res.json({ status: 'success', data: { isCorrect, correctOption: correct } });
}

async function handleSubmitTest(token, { testId }, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  
  // Check if already submitted
  const [existing] = await db.query('SELECT * FROM results WHERE studentId = ? AND testId = ?', [studentId, testId]);
  if (existing.length) return res.json({ status: 'error', data: 'Already submitted' });
  
  const [testRow] = await db.query('SELECT * FROM tests WHERE testId = ?', [testId]);
  if (testRow.length === 0) return res.json({ status: 'error', data: 'Test not found' });
  const test = testRow[0];
  const defaultCorrect = parseFloat(test.correctMarks);
  const defaultWrong = parseFloat(test.wrongMarks);
  const defaultSkip = parseFloat(test.skipMarks);
  
  const [questions] = await db.query('SELECT * FROM questions WHERE testId = ?', [testId]);
  const [responses] = await db.query('SELECT qId, selected FROM responses WHERE studentId = ? AND testId = ?', [studentId, testId]);
  const answerMap = new Map(responses.map(r => [r.qId, r.selected]));
  
  let totalScore = 0;
  for (const q of questions) {
    const selected = answerMap.get(q.qId);
    if (!selected) {
      totalScore += (q.customSkip !== null ? parseFloat(q.customSkip) : defaultSkip);
      continue;
    }
    let isCorrect = false;
    if (q.type === 'numerical') {
      const numSelected = parseFloat(selected);
      const numCorrect = parseFloat(q.correct);
      const tolerance = parseFloat(q.tolerance) || 0;
      isCorrect = Math.abs(numSelected - numCorrect) <= tolerance;
    } else {
      isCorrect = (selected === q.correct);
    }
    if (isCorrect) {
      totalScore += (q.customCorrect !== null ? parseFloat(q.customCorrect) : defaultCorrect);
    } else {
      totalScore += (q.customWrong !== null ? parseFloat(q.customWrong) : defaultWrong);
    }
  }
  
  await db.query('INSERT INTO results (studentId, testId, score, submittedOn) VALUES (?,?,?,NOW())', [studentId, testId, totalScore]);
  
  // Compute rank
  const [allResults] = await db.query('SELECT studentId, score FROM results WHERE testId = ? ORDER BY score DESC, submittedOn ASC', [testId]);
  const rank = allResults.findIndex(r => r.studentId === studentId) + 1;
  
  // Send email
  const [student] = await db.query('SELECT email, name FROM students WHERE id = ?', [studentId]);
  if (student.length && student[0].email) {
    await sendEmail(student[0].email, `Test Result: ${test.testName}`, `Dear ${student[0].name},\n\nYour score: ${totalScore}\nRank: ${rank}\n\nThank you.`);
  }
  
  res.json({ status: 'success', data: { score: totalScore, rank } });
}

async function handleGetStudentResults(token, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [results] = await db.query(`
    SELECT r.testId, r.score, r.submittedOn, t.testName
    FROM results r
    JOIN tests t ON r.testId = t.testId
    WHERE r.studentId = ?
  `, [studentId]);
  // Compute rank for each result
  const enriched = [];
  for (const resRow of results) {
    const [all] = await db.query('SELECT studentId FROM results WHERE testId = ? ORDER BY score DESC, submittedOn ASC', [resRow.testId]);
    const rank = all.findIndex(a => a.studentId === studentId) + 1;
    enriched.push({
      testId: resRow.testId,
      testName: resRow.testName,
      score: resRow.score,
      rank: rank,
      submitted: resRow.submittedOn
    });
  }
  res.json({ status: 'success', data: enriched });
}

async function handleGetTestAnalysis(token, { testId, studentId: reqStudentId }, res) {
  let studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  // Allow admin override
  if (studentId === 'admin' && reqStudentId) studentId = reqStudentId;
  
  const [testRow] = await db.query('SELECT testName, correctMarks, wrongMarks, skipMarks FROM tests WHERE testId = ?', [testId]);
  if (!testRow.length) return res.json({ status: 'error', data: 'Test not found' });
  const test = testRow[0];
  
  const [questions] = await db.query('SELECT * FROM questions WHERE testId = ?', [testId]);
  const [responses] = await db.query('SELECT qId, selected FROM responses WHERE studentId = ? AND testId = ?', [studentId, testId]);
  const answerMap = new Map(responses.map(r => [r.qId, r.selected]));
  
  const defaultCorrect = parseFloat(test.correctMarks);
  const defaultWrong = parseFloat(test.wrongMarks);
  const defaultSkip = parseFloat(test.skipMarks);
  
  const analysis = {
    testName: test.testName,
    questions: questions.map(q => {
      const selected = answerMap.get(q.qId);
      let isCorrect = false;
      let marks = 0;
      if (!selected) {
        marks = q.customSkip !== null ? parseFloat(q.customSkip) : defaultSkip;
      } else if (q.type === 'numerical') {
        const numSelected = parseFloat(selected);
        const numCorrect = parseFloat(q.correct);
        const tolerance = parseFloat(q.tolerance) || 0;
        isCorrect = Math.abs(numSelected - numCorrect) <= tolerance;
        marks = isCorrect ? (q.customCorrect !== null ? parseFloat(q.customCorrect) : defaultCorrect) : (q.customWrong !== null ? parseFloat(q.customWrong) : defaultWrong);
      } else {
        isCorrect = (selected === q.correct);
        marks = isCorrect ? (q.customCorrect !== null ? parseFloat(q.customCorrect) : defaultCorrect) : (q.customWrong !== null ? parseFloat(q.customWrong) : defaultWrong);
      }
      return {
        qText: q.qTextEng,
        selected: selected || 'Not answered',
        correct: q.correct,
        isCorrect,
        marks,
        imageUrl: q.imageUrl
      };
    })
  };
  res.json({ status: 'success', data: analysis });
}

async function handleGetDiscussions(token, { testId }, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [posts] = await db.query('SELECT postId as id, title, description, link, createdOn as created FROM discussions WHERE testId = ? ORDER BY createdOn DESC', [testId]);
  res.json({ status: 'success', data: posts });
}

async function handleGetMessages(token, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [messages] = await db.query('SELECT messageId as id, sender, text, attachments, timestamp, replyTo FROM messages WHERE studentId = ? AND type != "unblock_request" ORDER BY timestamp ASC', [studentId]);
  res.json({ status: 'success', data: messages });
}

async function handleSendMessage(token, { text }, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [blocked] = await db.query('SELECT * FROM blocked WHERE studentId = ?', [studentId]);
  if (blocked.length) return res.json({ status: 'error', data: 'You are blocked from sending messages' });
  const messageId = uuidv4();
  await db.query('INSERT INTO messages (messageId, studentId, sender, text, attachments, timestamp) VALUES (?,?,?,?,?,NOW())', [messageId, studentId, 'student', text, '[]']);
  res.json({ status: 'success', data: 'Message sent' });
}

async function handleCheckBlocked(token, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [blocked] = await db.query('SELECT * FROM blocked WHERE studentId = ?', [studentId]);
  res.json({ status: 'success', data: { blocked: blocked.length > 0, reason: blocked.length ? blocked[0].reason : null } });
}

async function handleGetAllTestNames(token, res) {
  const studentId = verifyToken(token);
  if (!studentId) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [tests] = await db.query('SELECT testId, testName FROM tests');
  res.json({ status: 'success', data: tests });
}

async function handleGetToppers(token, { testId }, res) {
  const studentId = verifyToken(token);
  if (!studentId && token !== 'admin') return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [rows] = await db.query(`
    SELECT r.studentId, r.score, s.name
    FROM results r
    JOIN students s ON r.studentId = s.id
    WHERE r.testId = ?
    ORDER BY r.score DESC, r.submittedOn ASC
    LIMIT 3
  `, [testId]);
  res.json({ status: 'success', data: rows });
}

async function handleGetTestParticipants(token, { testId }, res) {
  const studentId = verifyToken(token);
  if (!studentId && token !== 'admin') return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [rows] = await db.query(`
    SELECT r.studentId, r.score, s.name, s.id
    FROM results r
    JOIN students s ON r.studentId = s.id
    WHERE r.testId = ?
    ORDER BY r.score DESC, r.submittedOn ASC
  `, [testId]);
  const participants = rows.map((r, idx) => ({ rank: idx+1, studentId: r.studentId, name: r.name, score: r.score }));
  res.json({ status: 'success', data: participants });
}

module.exports = router;
