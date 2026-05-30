const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');

router.post('/solve', timetableController.triggerAiScheduler);
router.get('/status/:jobId', timetableController.getSchedulerJobStatus);
router.route('/').get(timetableController.getAllTimetables).post(timetableController.createTimetable);
router.route('/:id').put(timetableController.updateTimetable).delete(timetableController.deleteTimetable);

module.exports = router;