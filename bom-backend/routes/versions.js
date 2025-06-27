const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET: 获取指定物料的所有BOM版本
// 使用 :materialId 作为参数
router.get('/material/:materialId', async (req, res) => {
    try {
        const { materialId } = req.params;
        const query = 'SELECT * FROM bom_versions WHERE material_id = ? ORDER BY version_code DESC';
        const [versions] = await db.query(query, [materialId]);
        res.json(versions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: 为指定物料创建新的BOM版本
router.post('/', async (req, res) => {
    try {
        const { material_id, version_code, remark } = req.body;
        // 可选：将该物料的其他版本设置为非激活
        await db.query('UPDATE bom_versions SET is_active = false WHERE material_id = ?', [material_id]);

        const query = 'INSERT INTO bom_versions (material_id, version_code, remark, is_active) VALUES (?, ?, ?, true)';
        const [result] = await db.query(query, [material_id, version_code, remark]);
        res.status(201).json({ id: result.insertId, ...req.body, is_active: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: 删除一个BOM版本
// 注意: 数据库中的 ON DELETE CASCADE 会自动删除所有关联的 bom_lines
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM bom_versions WHERE id = ?', [id]);
        res.json({ message: 'BOM version deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;