const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');

router.route('/')
    .get(organizationController.getAllUnits)
    .post(organizationController.createUnit);

router.route('/:id')
    .get(organizationController.getUnitById)
    .put(organizationController.updateUnit)
    .delete(organizationController.deleteUnit);

module.exports = router;