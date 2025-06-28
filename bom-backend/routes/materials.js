const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const ExcelJS = require('exceljs');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 其他代码保持不变 ---

// 新增: GET路由，用于下载Excel模板文件
router.get('/template', (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('物料导入模板');

    // 定义表头
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

    // 设置响应头，告知浏览器这是一个需要下载的Excel文件
    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
        'Content-Disposition',
        'attachment; filename=material_import_template.xlsx'
    );

    // 将工作簿写入响应流
    workbook.xlsx.write(res).then(() => {
        res.end();
    });
});


// GET: 获取所有物料 (带搜索和分页功能)
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let countQuery = 'SELECT COUNT(*) as total FROM materials';
        let dataQuery = 'SELECT * FROM materials';
        const params = [];

        if (search) {
            const searchQuery = ' WHERE material_code LIKE ? OR name LIKE ? OR alias LIKE ?';
            countQuery += searchQuery;
            dataQuery += searchQuery;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        dataQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
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

// POST: 通过Excel文件批量导入物料 (最终版：存在即更新)
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

            // 使用 INSERT ... ON DUPLICATE KEY UPDATE 语句
            // 这条SQL语句会尝试插入新行，如果因为主键或唯一键冲突失败，则会执行UPDATE操作
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

            // 根据 affectedRows 的值来判断是新增还是更新
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
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: err.message });
    }
});

// DELETE: 删除物料 (支持批量删除) - 最终修复版，处理外键约束
router.post('/delete', async (req, res) => {
    // 1. 获取数据库连接，并开启一个“事务”
    // 事务能确保所有数据库操作要么全部成功，要么全部失败，保证数据一致性
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            await connection.rollback(); // 回滚事务
            connection.release();     // 释放连接
            return res.status(400).json({ message: '请求格式错误，必须提供一个包含ID的非空数组。' });
        }

        // 2. 在删除物料之前，先删除所有引用了这些物料的BOM行
        // 这是解决外键约束问题的核心步骤
        const deleteBomLinesQuery = 'DELETE FROM bom_lines WHERE component_id IN (?)';
        await connection.query(deleteBomLinesQuery, [ids]);

        // 3. 接下来，处理这些物料作为“父物料”时的情况：
        // a. 找到这些物料对应的所有BOM版本
        const findVersionsQuery = 'SELECT id FROM bom_versions WHERE material_id IN (?)';
        const [versions] = await connection.query(findVersionsQuery, [ids]);

        if (versions.length > 0) {
            const versionIds = versions.map(v => v.id);
            // b. 删除这些BOM版本下的所有BOM行 (虽然数据库有级联删除，但显式操作更安全)
            const deleteVersionLinesQuery = 'DELETE FROM bom_lines WHERE version_id IN (?)';
            await connection.query(deleteVersionLinesQuery, [versionIds]);

            // c. 删除这些BOM版本本身
            const deleteVersionsQuery = 'DELETE FROM bom_versions WHERE material_id IN (?)';
            await connection.query(deleteVersionsQuery, [ids]);
        }

        // 4. 最后，在清除了所有依赖之后，安全地删除物料本身
        const deleteMaterialsQuery = 'DELETE FROM materials WHERE id IN (?)';
        const [result] = await connection.query(deleteMaterialsQuery, [ids]);

        // 5. 如果所有操作都成功了，就“提交”事务，让更改永久生效
        await connection.commit();

        res.json({ message: `操作成功，共删除了 ${result.affectedRows} 条物料及其所有相关BOM数据。` });

    } catch (err) {
        // 6. 如果在任何步骤中发生错误，就“回滚”事务，撤销所有已做的更改
        await connection.rollback();
        console.error('删除物料时发生严重错误:', err);
        res.status(500).json({ error: '服务器在处理删除请求时发生意外错误。', details: err.message });
    } finally {
        // 7. 无论成功还是失败，最后都要释放数据库连接
        connection.release();
    }
});

// GET: 用于BOM行项目选择器的轻量级物料搜索
router.get('/search', async (req, res) => {
    try {
        const { term } = req.query; // 搜索词
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

// 2. 新增：批量导出所选物料为Excel
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

module.exports = router;