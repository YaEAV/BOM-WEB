// bom-backend/routes/cleanup.js (新建文件)
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// --- Service Layer for Cleanup ---
const CleanupService = {
    /**
     * 查找所有没有BOM行的BOM版本
     */
    async getEmptyBomVersions() {
        const query = `
            SELECT v.id, v.version_code, m.material_code, m.name as material_name
            FROM bom_versions v
                     LEFT JOIN bom_lines l ON v.id = l.version_id
                     JOIN materials m ON v.material_id = m.id
            WHERE v.deleted_at IS NULL
            GROUP BY v.id
            HAVING COUNT(l.id) = 0;
        `;
        const [versions] = await db.query(query);
        return { data: versions, total: versions.length, hasMore: false };
    },

    /**
     * 查找从未被用作子件的物料 (并且它们自己也不是父件)
     */
    async getUnusedMaterials() {
        const query = `
            SELECT m.id, m.material_code, m.name, m.category
            FROM materials m
                     LEFT JOIN bom_lines bl ON m.id = bl.component_id
            WHERE m.deleted_at IS NULL AND bl.id IS NULL
              AND m.id NOT IN (SELECT material_id FROM bom_versions WHERE deleted_at IS NULL);
        `;
        const [materials] = await db.query(query);
        return { data: materials, total: materials.length, hasMore: false };
    },

    /**
     * 查找属于已被软删除物料的图纸
     */
    async getOrphanedDrawings() {
        const query = `
            SELECT d.id, d.file_name, d.version as drawing_version, m.material_code, m.name as material_name, m.deleted_at
            FROM material_drawings d
                     JOIN materials m ON d.material_id = m.id
            WHERE m.deleted_at IS NOT NULL;
        `;
        const [drawings] = await db.query(query);
        return { data: drawings, total: drawings.length, hasMore: false };
    }
};

// --- Controller Layer (Routes) ---
router.get('/empty-bom-versions', async (req, res, next) => {
    try {
        res.json(await CleanupService.getEmptyBomVersions());
    } catch (err) {
        next(err);
    }
});

router.get('/unused-materials', async (req, res, next) => {
    try {
        res.json(await CleanupService.getUnusedMaterials());
    } catch (err) {
        next(err);
    }
});

router.get('/orphaned-drawings', async (req, res, next) => {
    try {
        res.json(await CleanupService.getOrphanedDrawings());
    } catch (err) {
        next(err);
    }
});

module.exports = router;