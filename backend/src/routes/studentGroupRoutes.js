const express = require('express');
const router = express.Router();
const studentGroupController = require('../controllers/studentGroupController');

router.get('/preview', studentGroupController.previewStudentGroup);
router.route('/').get(studentGroupController.getAllStudentGroups).post(studentGroupController.createStudentGroup);
router.route('/:id').put(studentGroupController.updateStudentGroup).delete(studentGroupController.deleteStudentGroup);

module.exports = router;