const express = require('express');
const router = express.Router();
const cohortController = require('../controllers/cohortController');

router.route('/')
    .get(cohortController.getAllCohorts)
    .post(cohortController.createCohort);

router.route('/:id')
    .put(cohortController.updateCohort)
    .delete(cohortController.deleteCohort);

module.exports = router;