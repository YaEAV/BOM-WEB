const express = require('express');
const router = express.Router();
const db = require('../config/db');

// --- MODIFIED: GET / - 修正了搜索时的总数统计查询 ---
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', sortBy = 'created_at', sortOrder = 'desc' } = req.query;
        const offset = (page - 1) * limit;

        const searchTerm = `%${search}%`;
        const params = [searchTerm, searchTerm];

        const allowedSortBy = ['version_code', 'material_code', 'created_at'];
        const safeSortBy = allowedSortBy.includes(sortBy) ? `v.${sortBy}` : 'v.created_at';
        const safeSortOrder = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

        const dataQuery = `
            SELECT
                v.id, v.version_code, v.remark, v.is_active, v.created_at, v.material_id,
                m.material_code, m.name as material_name
            FROM bom_versions v
                     JOIN materials m ON v.material_id = m.id
            WHERE v.version_code LIKE ? OR m.material_code LIKE ?
            ORDER BY ${safeSortBy} ${safeSortOrder}
            LIMIT ? OFFSET ?
        `;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM bom_versions v
                     JOIN materials m ON v.material_id = m.id
            WHERE v.version_code LIKE ? OR m.material_code LIKE ?
        `;

        const [versions] = await db.query(dataQuery, [...params, parseInt(limit), parseInt(offset)]);
        const [[{ total }]] = await db.query(countQuery, params); // 使用相同的搜索参数

        res.json({
            data: versions,
            total,
            hasMore: (offset + versions.length) < total,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// 其他路由保持不变
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

router.post('/', async (req, res) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        const { material_id, version_code, remark, is_active = true } = req.body;

        if (is_active) {
            await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ?', [material_id]);
        }

        const query = 'INSERT INTO bom_versions (material_id, version_code, remark, is_active) VALUES (?, ?, ?, ?)';
        const [result] = await connection.query(query, [material_id, version_code, remark, is_active]);

        await connection.commit();
        res.status(201).json({ id: result.insertId, ...req.body, is_active: true });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

router.put('/:id', async (req, res) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        const { id } = req.params;
        const { remark, is_active, material_id } = req.body;

        if (is_active) {
            await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ? AND id != ?', [material_id, id]);
        }

        const query = 'UPDATE bom_versions SET remark = ?, is_active = ? WHERE id = ?';
        await connection.query(query, [remark, is_active, id]);

        await connection.commit();
        res.json({ message: 'BOM 版本更新成功' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

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