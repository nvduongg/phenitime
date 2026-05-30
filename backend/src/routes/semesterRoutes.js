const express = require('express');
const router = express.Router();
const semesterController = require('../controllers/semesterController');

router.route('/')
    .get(semesterController.getAllSemesters)
    .post(semesterController.createSemester);

router.route('/:id')
    .put(semesterController.updateSemester)
    .delete(semesterController.deleteSemester);

module.exports = router;