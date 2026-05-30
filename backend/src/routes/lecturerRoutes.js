const express = require('express');
const router = express.Router();
const lecturerController = require('../controllers/lecturerController');

router.route('/').get(lecturerController.getAllLecturers).post(lecturerController.createLecturer);
router.route('/:id').put(lecturerController.updateLecturer).delete(lecturerController.deleteLecturer);

module.exports = router;