const express = require('express');
const db = require('../db');
const { generateToken } = require('../utils/helpers');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const tokenStore = new Map(); // share with student? In production use same store

function verifyAdminToken(token) {
  const data = tokenStore.get(token);
  if (!data || data.studentId !== 'admin' || Date.now() > data.exp) return false;
  return true;
}

router.post('/', async (req, res) => {
  const { action, token, ...params } = req.body;
  
  try {
    switch (action) {
      case 'adminLogin': return handleAdminLogin(params, res);
      case 'addStudent': return handleAddStudent(token, params, res);
      case 'addTest': return handleAddTest(token, params, res);
      case 'deleteTest': return handleDeleteTest(token, params, res);
      case 'addQuestion': return handleAddQuestion(token, params, res);
      case 'updateQuestion': return handleUpdateQuestion(token, params, res);
      case 'deleteQuestion': return handleDeleteQuestion(token, params, res);
      case 'getAllTests': return handleGetAllTests(token, res);
      case 'getAllStudents': return handleGetAllStudents(token, res);
      case 'getResults': return handleGetResults(token, params, res);
      case 'updateAdminPassword': return handleUpdateAdminPassword(token, params, res);
      case 'addDiscussion': return handleAddDiscussion(token, params, res);
      case 'deleteDiscussion': return handleDeleteDiscussion(token, params, res);
      case 'getAllDiscussions': return handleGetAllDiscussions(token, res);
      case 'getAllMessages': return handleGetAllMessages(token, res);
      case 'sendAdminReply': return handleSendAdminReply(token, params, res);
      case 'blockStudent': return handleBlockStudent(token, params, res);
      case 'unblockStudent': return handleUnblockStudent(token, params, res);
      case 'getBlockedStudents': return handleGetBlockedStudents(token, res);
      default: return res.json({ status: 'error', data: 'Unknown admin action' });
    }
  } catch (err) {
    console.error(err);
    res.json({ status: 'error', data: err.message });
  }
});

async function handleAdminLogin({ password }, res) {
  const [rows] = await db.query('SELECT configValue FROM config WHERE configKey = "admin_password"');
  if (rows.length && rows[0].configValue === password) {
    const token = generateToken();
    tokenStore.set(token, { studentId: 'admin', exp: Date.now() + 8 * 60 * 60 * 1000 });
    res.json({ status: 'success', token });
  } else {
    res.json({ status: 'error', data: 'Wrong password' });
  }
}

async function handleAddStudent(token, { id, name, dob, studentClass, mobile, email }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  if (!id || !name || !dob) return res.json({ status: 'error', data: 'Missing required fields' });
  if (dob.length !== 8) return res.json({ status: 'error', data: 'DOB must be 8 digits' });
  const [existing] = await db.query('SELECT id FROM students WHERE id = ?', [id]);
  if (existing.length) return res.json({ status: 'error', data: 'Student ID exists' });
  await db.query('INSERT INTO students (id, name, dob, class, mobile, email, registered_on) VALUES (?,?,?,?,?,?,NOW())', [id, name, dob, studentClass || '', mobile || '', email || '']);
  res.json({ status: 'success', data: 'Student added' });
}

async function handleAddTest(token, { testId, testName, duration, shuffle, correctMarks, wrongMarks, skipMarks }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  await db.query('INSERT INTO tests (testId, testName, duration, shuffle, correctMarks, wrongMarks, skipMarks) VALUES (?,?,?,?,?,?,?)', 
    [testId, testName, duration, shuffle || 'FALSE', correctMarks || 1, wrongMarks || 0, skipMarks || 0]);
  res.json({ status: 'success', data: 'Test added' });
}

async function handleDeleteTest(token, { testId }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  await db.query('DELETE FROM tests WHERE testId = ?', [testId]);
  await db.query('DELETE FROM questions WHERE testId = ?', [testId]);
  await db.query('DELETE FROM responses WHERE testId = ?', [testId]);
  await db.query('DELETE FROM results WHERE testId = ?', [testId]);
  await db.query('DELETE FROM discussions WHERE testId = ?', [testId]);
  res.json({ status: 'success', data: 'Test deleted' });
}

async function handleAddQuestion(token, params, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const { qId, testId, type, qTextEng, qTextHin, opt1Eng, opt1Hin, opt2Eng, opt2Hin, opt3Eng, opt3Hin, opt4Eng, opt4Hin, correct, tolerance, customCorrect, customWrong, customSkip, imageUrl } = params;
  await db.query(
    'INSERT INTO questions (qId, testId, type, qTextEng, qTextHin, opt1Eng, opt1Hin, opt2Eng, opt2Hin, opt3Eng, opt3Hin, opt4Eng, opt4Hin, correct, tolerance, customCorrect, customWrong, customSkip, imageUrl) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [qId, testId, type, qTextEng, qTextHin || '', opt1Eng || '', opt1Hin || '', opt2Eng || '', opt2Hin || '', opt3Eng || '', opt3Hin || '', opt4Eng || '', opt4Hin || '', correct, tolerance || 0, customCorrect || '', customWrong || '', customSkip || '', imageUrl || '']
  );
  res.json({ status: 'success', data: 'Question added' });
}

async function handleUpdateQuestion(token, params, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const { qId, testId, type, qTextEng, qTextHin, opt1Eng, opt1Hin, opt2Eng, opt2Hin, opt3Eng, opt3Hin, opt4Eng, opt4Hin, correct, tolerance, customCorrect, customWrong, customSkip, imageUrl } = params;
  await db.query(
    `UPDATE questions SET type=?, qTextEng=?, qTextHin=?, opt1Eng=?, opt1Hin=?, opt2Eng=?, opt2Hin=?, opt3Eng=?, opt3Hin=?, opt4Eng=?, opt4Hin=?, correct=?, tolerance=?, customCorrect=?, customWrong=?, customSkip=?, imageUrl=? WHERE qId=? AND testId=?`,
    [type, qTextEng, qTextHin, opt1Eng, opt1Hin, opt2Eng, opt2Hin, opt3Eng, opt3Hin, opt4Eng, opt4Hin, correct, tolerance, customCorrect, customWrong, customSkip, imageUrl, qId, testId]
  );
  res.json({ status: 'success', data: 'Question updated' });
}

async function handleDeleteQuestion(token, { qId, testId }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  await db.query('DELETE FROM questions WHERE qId = ? AND testId = ?', [qId, testId]);
  res.json({ status: 'success', data: 'Deleted' });
}

async function handleGetAllTests(token, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [rows] = await db.query('SELECT testId, testName, duration, shuffle, correctMarks, wrongMarks, skipMarks FROM tests');
  res.json({ status: 'success', data: rows });
}

async function handleGetAllStudents(token, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [rows] = await db.query('SELECT id, name, dob, class, mobile, email, registered_on as registered FROM students');
  res.json({ status: 'success', data: rows });
}

async function handleGetResults(token, { testId }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  let query = `
    SELECT r.studentId, r.testId, r.score, r.submittedOn, s.name as studentName, t.testName
    FROM results r
    JOIN students s ON r.studentId = s.id
    JOIN tests t ON r.testId = t.testId
  `;
  const params = [];
  if (testId) {
    query += ' WHERE r.testId = ?';
    params.push(testId);
  }
  query += ' ORDER BY r.submittedOn DESC';
  const [rows] = await db.query(query, params);
  // Add rank for each row
  const enriched = [];
  for (const row of rows) {
    const [all] = await db.query('SELECT studentId FROM results WHERE testId = ? ORDER BY score DESC, submittedOn ASC', [row.testId]);
    const rank = all.findIndex(a => a.studentId === row.studentId) + 1;
    enriched.push({ ...row, rank });
  }
  res.json({ status: 'success', data: enriched });
}

async function handleUpdateAdminPassword(token, { newPassword }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  await db.query('UPDATE config SET configValue = ? WHERE configKey = "admin_password"', [newPassword]);
  res.json({ status: 'success', data: 'Password updated' });
}

async function handleAddDiscussion(token, { testId, title, description, link }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const postId = uuidv4();
  await db.query('INSERT INTO discussions (postId, testId, title, description, link, createdOn) VALUES (?,?,?,?,?,NOW())', [postId, testId, title, description || '', link || '']);
  res.json({ status: 'success', data: 'Discussion added' });
}

async function handleDeleteDiscussion(token, { postId }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  await db.query('DELETE FROM discussions WHERE postId = ?', [postId]);
  res.json({ status: 'success', data: 'Deleted' });
}

async function handleGetAllDiscussions(token, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [rows] = await db.query('SELECT * FROM discussions ORDER BY createdOn DESC');
  res.json({ status: 'success', data: rows });
}

async function handleGetAllMessages(token, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [rows] = await db.query('SELECT * FROM messages ORDER BY timestamp ASC');
  res.json({ status: 'success', data: rows });
}

async function handleSendAdminReply(token, { messageId, studentId, text }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const newMessageId = uuidv4();
  await db.query('INSERT INTO messages (messageId, studentId, sender, text, attachments, timestamp, replyTo) VALUES (?,?,?,?,?,NOW(),?)', [newMessageId, studentId, 'admin', text, '[]', messageId]);
  res.json({ status: 'success', data: 'Reply sent' });
}

async function handleBlockStudent(token, { studentId, reason }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  await db.query('INSERT INTO blocked (studentId, reason, blockedOn) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE reason = ?, blockedOn = NOW()', [studentId, reason, reason]);
  res.json({ status: 'success', data: 'Student blocked' });
}

async function handleUnblockStudent(token, { studentId }, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  await db.query('DELETE FROM blocked WHERE studentId = ?', [studentId]);
  res.json({ status: 'success', data: 'Student unblocked' });
}

async function handleGetBlockedStudents(token, res) {
  if (!verifyAdminToken(token)) return res.status(401).json({ status: 'error', data: 'Unauthorized' });
  const [rows] = await db.query('SELECT * FROM blocked ORDER BY blockedOn DESC');
  res.json({ status: 'success', data: rows });
}

module.exports = router;
