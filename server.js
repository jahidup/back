const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(cors());
app.use(express.json());

// Single entry point for compatibility with original frontend
// It will route based on "action" field
app.post('/api', async (req, res) => {
  const { action } = req.body;
  
  // Route to appropriate handler
  if (action.startsWith('admin') || action === 'addStudent' || action === 'addTest' || action === 'deleteTest' ||
      action === 'addQuestion' || action === 'updateQuestion' || action === 'deleteQuestion' ||
      action === 'getAllTests' || action === 'getAllStudents' || action === 'getResults' ||
      action === 'updateAdminPassword' || action === 'addDiscussion' || action === 'deleteDiscussion' ||
      action === 'getAllDiscussions' || action === 'getAllMessages' || action === 'sendAdminReply' ||
      action === 'blockStudent' || action === 'unblockStudent' || action === 'getBlockedStudents') {
    return adminRoutes(req, res);
  } else {
    return studentRoutes(req, res);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
