const express = require('express');
const userController = require('../controllers/userController');
const { requireRoles } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.use(requireRoles(ROLES.UNIVERSITY_TRAINING));

router.get('/scope-units', userController.listScopeUnitOptions);
router.get('/bulk-preview', userController.previewBulkAccounts);
router.post('/bulk-generate', userController.bulkGenerateAccounts);
router.post('/export-credentials', userController.exportAccountCredentials);
router.route('/').get(userController.listUsers).post(userController.createUser);
router.post('/:id/reset-password', userController.resetPassword);
router.route('/:id').put(userController.updateUser).delete(userController.deleteUser);

module.exports = router;
