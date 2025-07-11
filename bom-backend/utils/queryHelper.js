// bom-backend/utils/queryHelper.js (新建文件)

/**
 * 构造用于分页列表查询的完整SQL和参数
 * @param {object} db - 数据库连接池.
 * @param {string} baseQuery - 查询数据的基础SQL语句 (不含 WHERE, ORDER BY, LIMIT).
 * @param {string} countQuery - 查询总数的基础SQL语句 (不含 WHERE).
 * @param {object} options - 包含分页、排序和搜索参数的对象.
 * @param {number} [options.page=1] - 当前页码.
 * @param {number} [options.limit=20] - 每页数量.
 * @param {string} [options.search=''] - 搜索关键词.
 * @param {Array<string>} [options.searchFields=[]] - 可供搜索的字段.
 * @param {string} [options.sortBy='id'] - 排序列.
 * @param {string} [options.sortOrder='asc'] - 排序顺序.
 * @param {Array<string>} [options.allowedSortBy=[]] - 允许的排序列.
 * @param {boolean} [options.includeDeleted=false] - 是否包含已删除的记录.
 * @param {string} [options.deletedAtField='deleted_at'] - 软删除标记字段.
 * @returns {Promise<{data: Array, total: number, hasMore: boolean}>}
 */
async function findAndCount(db, baseQuery, countQuery, options) {
    const {
        page = 1,
        limit = 20,
        search = '',
        searchFields = [],
        sortBy = 'id',
        sortOrder = 'asc',
        allowedSortBy = [],
        includeDeleted = false,
        deletedAtField = 'deleted_at'
    } = options;

    const offset = (page - 1) * limit;
    let whereClauses = [];
    let params = [];

    // 处理软删除条件
    whereClauses.push(includeDeleted ? `${deletedAtField} IS NOT NULL` : `${deletedAtField} IS NULL`);

    // 处理搜索条件
    if (search && searchFields.length > 0) {
        const searchTerm = `%${search}%`;
        whereClauses.push(`(${searchFields.map(field => `${field} LIKE ?`).join(' OR ')})`);
        params.push(...searchFields.map(() => searchTerm));
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 处理排序条件
    const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : allowedSortBy[0] || 'id';
    const safeSortOrder = sortOrder?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const sortString = `ORDER BY ${safeSortBy} ${safeSortOrder}`;

    // 组合最终查询
    const finalDataQuery = `${baseQuery} ${whereString} ${sortString} LIMIT ? OFFSET ?`;
    const finalCountQuery = `${countQuery} ${whereString}`;

    const dataParams = [...params, parseInt(limit), parseInt(offset)];

    const [results] = await db.query(finalDataQuery, dataParams);
    const [[{ total }]] = await db.query(finalCountQuery, params);

    return { data: results, total, hasMore: (offset + results.length) < total };
}


module.exports = {
    findAndCount,
};