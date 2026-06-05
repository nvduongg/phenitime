const express = require('express');
const assignmentRequestController = require('../controllers/assignmentRequestController');

const router = express.Router();

router.get('/', assignmentRequestController.listAssignmentRequests);
router.post('/bulk', assignmentRequestController.bulkCreateAssignmentRequests);
router.post('/', assignmentRequestController.createAssignmentRequest);
router.post('/:id/fulfill', assignmentRequestController.fulfillAssignmentRequest);
router.post('/:id/cancel', assignmentRequestController.cancelAssignmentRequest);
router.post('/:id/reject', assignmentRequestController.rejectAssignmentRequest);

module.exports = router;
