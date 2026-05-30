const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculumController');

// Route gốc: /api/v1/curricula
router.route('/')
    .get(curriculumController.getAllCurricula)
    .post(curriculumController.createCurriculum);

// Route xử lý Roadmap (Phải đặt trước /:id)
router.route('/roadmap')
    .post(curriculumController.createRoadmap);

// Route có tham số :id
router.route('/:id')
    .put(curriculumController.updateCurriculum)
    .delete(curriculumController.deleteCurriculum);

module.exports = router;