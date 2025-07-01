// bom-backend/routes/materials.js (已增加新接口)

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const ExcelJS = require('exceljs');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const getSearchWhereClause = (search) => {
    if (!search) return { whereClause: '', params: [] };
    const searchTerm = `%${search}%`;
    return {
        whereClause: ' WHERE material_code LIKE ? OR name LIKE ? OR alias LIKE ?',
        params: [searchTerm, searchTerm, searchTerm]
    };
};

router.get('/template', (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('物料导入模板');
    const headers = [
        { header: '物料编码', key: 'material_code', width: 20 },
        { header: '产品名称', key: 'name', width: 30 },
        { header: '别名', key: 'alias', width: 20 },
        { header: '规格描述', key: 'spec', width: 40 },
        { header: '物料属性', key: 'category', width: 15 },
        { header: '单位', key: 'unit', width: 10 },
        { header: '供应商', key: 'supplier', width: 25 },
        { header: '备注', key: 'remark', width: 40 }
    ];
    worksheet.columns = headers;
    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
        'Content-Disposition',
        'attachment; filename=material_import_template.xlsx'
    );
    workbook.xlsx.write(res).then(() => {
        res.end();
    });
});


// GET: 获取所有物料 (带搜索、分页和排序功能)
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 20, sortBy = 'material_code', sortOrder = 'asc' } = req.query;

        const offset = (page - 1) * limit;
        const { whereClause, params } = getSearchWhereClause(search);

        let countQuery = `SELECT COUNT(*) as total FROM materials${whereClause}`;
        let dataQuery = `SELECT * FROM materials${whereClause}`;

        const allowedSortBy = ['material_code', 'name', 'category', 'supplier'];
        const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : 'material_code';
        const safeSortOrder = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        dataQuery += ` ORDER BY ${safeSortBy} ${safeSortOrder}`;

        dataQuery += ' LIMIT ? OFFSET ?';
        const dataParams = [...params, parseInt(limit), parseInt(offset)];

        const [[{ total }]] = await db.query(countQuery, params);
        const [materials] = await db.query(dataQuery, dataParams);

        res.json({
            data: materials,
            total,
            hasMore: (offset + materials.length) < total
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: 通过Excel文件批量导入物料 (存在即更新)
router.post('/import', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: '未上传文件。' });
    }
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) {
            throw new Error('在Excel文件中找不到工作表。');
        }

        let newCount = 0;
        let updatedCount = 0;

        const headerMapping = {
            '物料编码': 'material_code', '产品名称': 'name', '别名': 'alias',
            '规格描述': 'spec', '物料属性': 'category', '单位': 'unit',
            '供应商': 'supplier', '备注': 'remark'
        };

        const headerRow = worksheet.getRow(1).values;
        const columnIndexMap = {};

        headerRow.forEach((header, index) => {
            if (headerMapping[header]) {
                columnIndexMap[headerMapping[header]] = index;
            }
        });

        if (!columnIndexMap.material_code || !columnIndexMap.name) {
            throw new Error('Excel表头必须包含 "物料编码" 和 "产品名称"。');
        }

        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const materialCode = row.values[columnIndexMap.material_code];
                const name = row.values[columnIndexMap.name];
                if (materialCode && name) {
                    rows.push(row);
                }
            }
        });

        for (const row of rows) {
            const materialData = {
                material_code: row.values[columnIndexMap.material_code],
                name:          row.values[columnIndexMap.name],
                alias:         row.values[columnIndexMap.alias] || null,
                spec:          row.values[columnIndexMap.spec] || null,
                category:      row.values[columnIndexMap.category] || null,
                unit:          row.values[columnIndexMap.unit] || null,
                supplier:      row.values[columnIndexMap.supplier] || null,
                remark:        row.values[columnIndexMap.remark] || null
            };

            const query = `
                INSERT INTO materials (material_code, name, alias, spec, category, unit, supplier, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                                         name = VALUES(name), alias = VALUES(alias), spec = VALUES(spec),
                                         category = VALUES(category), unit = VALUES(unit),
                                         supplier = VALUES(supplier), remark = VALUES(remark)
            `;
            const params = [
                materialData.material_code, materialData.name, materialData.alias,
                materialData.spec, materialData.category, materialData.unit,
                materialData.supplier, materialData.remark
            ];

            const [result] = await connection.query(query, params);

            if (result.affectedRows === 1) {
                newCount++;
            } else if (result.affectedRows === 2) {
                updatedCount++;
            }
        }

        await connection.commit();
        res.status(200).json({ message: `导入完成：新增 ${newCount} 条，更新 ${updatedCount} 条。` });

    } catch (err) {
        await connection.rollback();
        console.error('物料导入失败:', err);
        res.status(500).json({ error: `处理Excel文件失败: ${err.message}` });
    } finally {
        if (connection) connection.release();
    }
});

// POST: 创建新物料
router.post('/', async (req, res) => {
    try {
        const { material_code, name, alias, spec, category, unit, supplier, remark } = req.body;
        const query = 'INSERT INTO materials (material_code, name, alias, spec, category, unit, supplier, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await db.query(query, [material_code, name, alias, spec, category, unit, supplier, remark]);
        res.status(201).json({ id: result.insertId, ...req.body });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ error: '物料编码已存在。' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// PUT: 更新物料
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { material_code, name, alias, spec, category, unit, supplier, remark } = req.body;
        const query = 'UPDATE materials SET material_code = ?, name = ?, alias = ?, spec = ?, category = ?, unit = ?, supplier = ?, remark = ? WHERE id = ?';
        await db.query(query, [material_code, name, alias, spec, category, unit, supplier, remark, id]);
        res.json({ message: 'Material updated successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ error: '物料编码已存在。' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// DELETE: 删除物料
router.post('/delete', async (req, res) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: '请求格式错误，必须提供一个包含ID的非空数组。' });
        }

        const deleteBomLinesQuery = 'DELETE FROM bom_lines WHERE component_id IN (?)';
        await connection.query(deleteBomLinesQuery, [ids]);

        const findVersionsQuery = 'SELECT id FROM bom_versions WHERE material_id IN (?)';
        const [versions] = await connection.query(findVersionsQuery, [ids]);

        if (versions.length > 0) {
            const versionIds = versions.map(v => v.id);
            const deleteVersionLinesQuery = 'DELETE FROM bom_lines WHERE version_id IN (?)';
            await connection.query(deleteVersionLinesQuery, [versionIds]);

            const deleteVersionsQuery = 'DELETE FROM bom_versions WHERE material_id IN (?)';
            await connection.query(deleteVersionsQuery, [ids]);
        }

        const deleteMaterialsQuery = 'DELETE FROM materials WHERE id IN (?)';
        const [result] = await connection.query(deleteMaterialsQuery, [ids]);

        await connection.commit();

        res.json({ message: `操作成功，共删除了 ${result.affectedRows} 条物料及其所有相关BOM数据。` });

    } catch (err) {
        await connection.rollback();
        console.error('删除物料时发生严重错误:', err);
        res.status(500).json({ error: '服务器在处理删除请求时发生意外错误。', details: err.message });
    } finally {
        connection.release();
    }
});

// GET: 用于BOM行项目选择器的轻量级物料搜索
router.get('/search', async (req, res) => {
    try {
        const { term } = req.query;
        if (!term) {
            return res.json([]);
        }
        const query = `
            SELECT id, material_code, name, spec
            FROM materials
            WHERE material_code LIKE ? OR name LIKE ?
                LIMIT 15
        `;
        const params = [`%${term}%`, `%${term}%`];
        const [results] = await db.query(query, params);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: 批量导出所选物料为Excel
router.post('/export', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: '必须提供要导出的物料ID。' });
        }

        const query = 'SELECT * FROM materials WHERE id IN (?)';
        const [materials] = await db.query(query, [ids]);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('物料列表');

        worksheet.columns = [
            { header: '物料编号', key: 'material_code', width: 20 },
            { header: '产品名称', key: 'name', width: 30 },
            { header: '别名', key: 'alias', width: 20 },
            { header: '规格描述', key: 'spec', width: 40 },
            { header: '物料属性', key: 'category', width: 15 },
            { header: '单位', key: 'unit', width: 10 },
            { header: '供应商', key: 'supplier', width: 25 },
            { header: '备注', key: 'remark', width: 40 }
        ];

        worksheet.addRows(materials);

        const fileName = `Materials_Export_${Date.now()}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error("物料导出失败:", err);
        res.status(500).json({ error: '导出Excel文件失败。' });
    }
});

// GET: 获取所有符合搜索条件的物料ID
router.get('/all-ids', async (req, res) => {
    try {
        const { search } = req.query;
        const { whereClause, params } = getSearchWhereClause(search);
        let idQuery = `SELECT id FROM materials${whereClause}`;

        const [rows] = await db.query(idQuery, params);
        const ids = rows.map(row => row.id);
        res.json(ids);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: 物料反查 (Where-Used)
router.get('/:id/where-used', async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT
                p.id AS parent_material_id,
                p.material_code AS parent_material_code,
                p.name AS parent_name,
                v.id AS version_id,
                v.version_code,
                v.is_active
            FROM
                bom_lines bl
                    JOIN
                bom_versions v ON bl.version_id = v.id
                    JOIN
                materials p ON v.material_id = p.id
            WHERE
                bl.component_id = ?
            ORDER BY p.material_code, v.version_code;
        `;
        const [results] = await db.query(query, [id]);
        res.json(results);
    } catch (err) {
        console.error('物料反查失败:', err);
        res.status(500).json({ error: '查询物料使用情况失败' });
    }
});

// **新增**: 获取单个物料的接口
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [[material]] = await db.query('SELECT * FROM materials WHERE id = ?', [id]);
        if (!material) {
            return res.status(404).json({ error: 'Material not found.' });
        }
        res.json(material);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;