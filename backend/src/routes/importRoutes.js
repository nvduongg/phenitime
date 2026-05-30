const express = require('express');
const router = express.Router();
const importController = require('../controllers/importController');
const upload = require('../middlewares/upload');

// Route này sử dụng middleware upload.single('file') để bắt file có key là "file"
router.post('/courses', upload.single('file'), importController.importCourses);
router.post('/majors', upload.single('file'), importController.importMajors);
router.post('/lecturers', upload.single('file'), importController.importLecturers);
router.post('/rooms', upload.single('file'), importController.importRooms);
router.post('/course-sections', upload.single('file'), importController.importCourseSections);
router.post('/roadmaps', upload.single('file'), importController.importRoadmaps);
router.post('/student-groups', upload.single('file'), importController.importStudentGroups);

module.exports = router;