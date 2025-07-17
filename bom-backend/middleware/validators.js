// bom-backend/middleware/validators.js
const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const firstError = errors.array({ onlyFirstError: true })[0];
        const err = new Error(firstError.msg);
        err.statusCode = 400;
        return next(err);
    }
    next();
};

const validateUnit = [
    body('name').trim().notEmpty().withMessage('单位名称不能为空。'),
    handleValidationErrors
];

const validateSupplier = [
    body('name').trim().notEmpty().withMessage('供应商名称不能为空。'),
    body('contact').trim().optional({ checkFalsy: true }),
    body('phone').trim().optional({ checkFalsy: true }),
    body('address').trim().optional({ checkFalsy: true }),
    body('remark').trim().optional({ checkFalsy: true }),
    handleValidationErrors
];

const validateMaterial = [
    body('material_code').trim().notEmpty().withMessage('物料编码不能为空。'),
    body('name').trim().notEmpty().withMessage('产品名称不能为空。'),
    body('category').notEmpty().withMessage('物料属性不能为空。'),
    body('unit').notEmpty().withMessage('单位不能为空。'),
    handleValidationErrors
];

const validateVersionForCreate = [
    body('material_id').isInt({ min: 1 }).withMessage('无效的物料ID。'),
    body('version_code').trim().notEmpty().withMessage('BOM版本号不能为空。'),
    body('is_active').isBoolean().withMessage('激活状态必须是布尔值。'),
    handleValidationErrors
];

const validateVersionForUpdate = [
    body('remark').optional({ checkFalsy: true }).trim(),
    body('is_active').isBoolean().withMessage('激活状态必须是布尔值。'),
    body('material_id').isInt({ min: 1 }).withMessage('无效的物料ID。'),
    handleValidationErrors
];

const validateCopyVersion = [
    body('version_suffix').trim().notEmpty().withMessage('版本号后缀不能为空。'),
    body('is_active').isBoolean().withMessage('激活状态必须是布尔值。'),
    handleValidationErrors
];

// --- 核心新增：BOM行验证器 ---
const validateBomLine = [
    body('version_id').notEmpty().withMessage('未选择BOM版本，无法添加物料。').isInt({ min: 1 }).withMessage('无效的BOM版本ID。'),
    body('position_code').trim().notEmpty().withMessage('位置编号不能为空。'),
    body('component_id').notEmpty().withMessage('必须选择一个子件。').isInt({ min: 1 }).withMessage('无效的子件ID。'),
    body('quantity').isFloat({ min: 0.000001 }).withMessage('用量必须是大于0的数字。'),
    handleValidationErrors
];

module.exports = {
    validateUnit,
    validateSupplier,
    validateMaterial,
    validateVersionForCreate,
    validateVersionForUpdate,
    validateCopyVersion,
    validateBomLine, // 导出新的验证器
};