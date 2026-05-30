const express = require('express');
const settingsController = require('../controllers/settingsController');

const router = express.Router();

router.get('/scheduling', settingsController.getSchedulingSettings);
router.put('/scheduling', settingsController.updateSchedulingSettings);

module.exports = router;
