const express = require('express');
const router = express.Router();
const courseSectionController = require('../controllers/courseSectionController');

// Endpoint đặc biệt để kích hoạt thuật toán sinh lớp tự động
router.post('/auto-generate', courseSectionController.autoGenerateSections);
router.post('/auto-assign', courseSectionController.autoAssignLecturers);

// Các endpoint CRUD cơ bản
router.route('/')
    .get(courseSectionController.getAllCourseSections)
    .post(courseSectionController.createCourseSection);

router.route('/:id')
    .put(courseSectionController.updateCourseSection)
    .delete(courseSectionController.deleteCourseSection);

module.exports = router;