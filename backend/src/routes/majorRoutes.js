const express = require('express');
const router = express.Router();
const majorController = require('../controllers/majorController');

router.route('/')
    .get(majorController.getAllMajors)
    .post(majorController.createMajor);

router.route('/:id')
    .put(majorController.updateMajor)
    .delete(majorController.deleteMajor);

module.exports = router;
