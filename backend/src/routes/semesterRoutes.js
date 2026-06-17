const express = require('express');
const router = express.Router();
const semesterController = require('../controllers/semesterController');

router.route('/')
    .get(semesterController.getAllSemesters)
    .post(semesterController.createSemester);

const semesterWaveController = require('../controllers/semesterWaveController');

router.route('/:semesterId/waves')
    .get(semesterWaveController.getSemesterWaves)
    .put(semesterWaveController.replaceSemesterWaves);

router.route('/:id')
    .put(semesterController.updateSemester)
    .delete(semesterController.deleteSemester);

module.exports = router;