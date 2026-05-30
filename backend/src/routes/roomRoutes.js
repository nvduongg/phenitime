const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');

router.route('/').get(roomController.getAllRooms).post(roomController.createRoom);
router.route('/:id').put(roomController.updateRoom).delete(roomController.deleteRoom);

module.exports = router;