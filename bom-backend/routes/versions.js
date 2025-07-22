// bom-backend/routes/versions.js (Final Fix)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { validateVersionForCreate, validateVersionForUpdate, validateCopyVersion } = require('../middleware/validators');
const { findAndCount } = require('../utils/queryHelper'); // <-- CRITICAL FIX: This line was missing.

const VersionService = {

    async getVersions(options) {
        const baseQuery = `
            SELECT v.id, v.version_code, v.remark, v.is_active, v.created_at, v.deleted_at, v.material_id, 
                   m.material_code, m.name as material_name
            FROM bom_versions v JOIN materials m ON v.material_id = m.id
        `;
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM bom_versions v JOIN materials m ON v.material_id = m.id
        `;
        return findAndCount(db, baseQuery, countQuery, {
            ...options,
            searchFields: ['v.version_code', 'm.material_code', 'm.name'],
            allowedSortBy: ['version_code', 'material_code', 'created_at', 'deleted_at'],
            deletedAtField: 'v.deleted_at'
        });
    },

    async getVersionsByMaterial(materialId) {
        const query = 'SELECT * FROM bom_versions WHERE material_id = ? AND deleted_at IS NULL ORDER BY version_code DESC';
        const [versions] = await db.query(query, [materialId]);
        return versions;
    },

    async getActiveVersionForMaterial(materialId) {
        const query = 'SELECT * FROM bom_versions WHERE material_id = ? AND is_active = true AND deleted_at IS NULL LIMIT 1';
        const [versions] = await db.query(query, [materialId]);
        return versions.length > 0 ? versions[0] : null;
    },

    async copyVersion(originalVersionId, newData) {
        const { version_suffix, remark, is_active } = newData;
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const [[originalVersion]] = await connection.query('SELECT * FROM bom_versions WHERE id = ?', [originalVersionId]);
            if (!originalVersion) {
                const err = new Error('原始BOM版本不存在。');
                err.statusCode = 404;
                throw err;
            }

            const [[material]] = await connection.query('SELECT material_code FROM materials WHERE id = ?', [originalVersion.material_id]);
            const newVersionCode = `${material.material_code}_V${version_suffix}`;

            if (is_active) {
                await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ?', [originalVersion.material_id]);
            }

            const [newVersionResult] = await connection.query(
                'INSERT INTO bom_versions (material_id, version_code, remark, is_active) VALUES (?, ?, ?, ?)',
                [originalVersion.material_id, newVersionCode, remark, is_active]
            );
            const newVersionId = newVersionResult.insertId;

            const [allLines] = await connection.query('SELECT * FROM bom_lines WHERE version_id = ? AND deleted_at IS NULL', [originalVersionId]);
            if (allLines.length > 0) {
                const linesByParent = allLines.reduce((acc, line) => {
                    const parentId = line.parent_line_id || 'root';
                    if (!acc[parentId]) acc[parentId] = [];
                    acc[parentId].push(line);
                    return acc;
                }, {});

                async function copyLinesRecursive(originalParentId, newParentId) {
                    const children = linesByParent[originalParentId];
                    if (!children) return;

                    for (const line of children) {
                        const [result] = await connection.query(
                            'INSERT INTO bom_lines (version_id, parent_line_id, level, position_code, component_id, quantity, process_info, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            [newVersionId, newParentId, line.level, line.position_code, line.component_id, line.quantity, line.process_info, line.remark]
                        );
                        await copyLinesRecursive(line.id, result.insertId);
                    }
                }
                await copyLinesRecursive('root', null);
            }

            await connection.commit();

            const [[newVersion]] = await connection.query('SELECT * FROM bom_versions WHERE id = ?', [newVersionId]);
            return newVersion;

        } catch (err) {
            await connection.rollback();
            if (err.code === 'ER_DUP_ENTRY') {
                const customError = new Error(`新的版本号后缀 "${version_suffix}" 已存在，请使用不同的后缀。`);
                customError.statusCode = 409;
                throw customError;
            }
            throw err;
        } finally {
            if (connection) connection.release();
        }
    },

    async createVersion(data) {
        const { material_id, version_code, remark, is_active = true } = data;
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            if (is_active) {
                await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ?', [material_id]);
            }
            const query = 'INSERT INTO bom_versions (material_id, version_code, remark, is_active) VALUES (?, ?, ?, ?)';
            const [result] = await connection.query(query, [material_id, version_code, remark, is_active]);
            await connection.commit();
            return { id: result.insertId, ...data, is_active: true };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            if (connection) connection.release();
        }
    },

    async updateVersion(id, data) {
        const { remark, is_active, material_id } = data;
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            if (is_active) {
                await connection.query('UPDATE bom_versions SET is_active = false WHERE material_id = ? AND id != ?', [material_id, id]);
            }
            const query = 'UPDATE bom_versions SET remark = ?, is_active = ? WHERE id = ?';
            await connection.query(query, [remark, is_active, id]);
            await connection.commit();
            return { message: 'BOM 版本更新成功' };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            if (connection) connection.release();
        }
    },

    async deletePermanent(ids) {
        const connection = await db.getConnection();
        await connection.beginTransaction();
        try {
            await connection.query('DELETE FROM bom_lines WHERE version_id IN (?)', [ids]);
            const [result] = await connection.query('DELETE FROM bom_versions WHERE id IN (?)', [ids]);
            await connection.commit();
            return { message: `成功彻底删除 ${result.affectedRows} 个BOM版本及其所有物料行。` };
        } catch(err) {
            await connection.rollback();
            throw err;
        } finally {
            if (connection) connection.release();
        }
    },

    async deleteVersions(ids) {
        const query = 'UPDATE bom_versions SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL';
        const [result] = await db.query(query, [ids]);
        return { message: `成功将 ${result.affectedRows} 个BOM版本移至回收站。` };
    },

    async restoreVersions(ids) {
        const query = 'UPDATE bom_versions SET deleted_at = NULL WHERE id IN (?)';
        const [result] = await db.query(query, [ids]);
        return { message: `成功恢复了 ${result.affectedRows} 个BOM版本。`};
    },
};

// Routes
router.get('/', async (req, res, next) => {
    try {
        const includeDeleted = req.query.includeDeleted === 'true';
        res.json(await VersionService.getVersions({ ...req.query, includeDeleted }));
    } catch (err) { next(err); }
});

router.get('/material/:materialId/active', async (req, res, next) => {
    try {
        const activeVersion = await VersionService.getActiveVersionForMaterial(req.params.materialId);
        if (activeVersion) {
            res.json(activeVersion);
        } else {
            res.status(404).json({ error: '该物料没有找到已激活的BOM版本。' });
        }
    } catch (err) { next(err); }
});

router.get('/material/:materialId', async (req, res, next) => {
    try {
        res.json(await VersionService.getVersionsByMaterial(req.params.materialId));
    } catch (err) { next(err); }
});

router.post('/', validateVersionForCreate, async (req, res, next) => {
    try {
        res.status(201).json(await VersionService.createVersion(req.body));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            const customError = new Error(`版本号 "${req.body.version_code}" 已存在。`);
            customError.statusCode = 409;
            next(customError);
        } else {
            next(err);
        }
    }
});

router.put('/:id', validateVersionForUpdate, async (req, res, next) => {
    try {
        res.json(await VersionService.updateVersion(req.params.id, req.body));
    } catch (err) { next(err); }
});

router.post('/:id/copy', validateCopyVersion, async (req, res, next) => {
    try {
        const newVersion = await VersionService.copyVersion(req.params.id, req.body);
        res.status(201).json(newVersion);
    } catch(err) {
        next(err);
    }
});

router.post('/delete', async (req, res, next) => {
    try {
        res.json(await VersionService.deleteVersions(req.body.ids));
    } catch (err) { next(err); }
});

router.post('/delete-permanent', async (req, res, next) => {
    try {
        res.json(await VersionService.deletePermanent(req.body.ids));
    } catch (err) { next(err); }
});

router.post('/restore', async (req, res, next) => {
    try {
        res.json(await VersionService.restoreVersions(req.body.ids));
    } catch (err) { next(err); }
});


module.exports = router;