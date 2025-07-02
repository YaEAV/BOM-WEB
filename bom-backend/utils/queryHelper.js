// bom-backend/utils/queryHelper.js (新增文件)

/**
 * 构造用于模糊搜索的 WHERE 子句和参数
 * @param {string} search - 搜索关键词.
 * @param {Array<string>} fields - 要搜索的字段数组.
 * @returns {{whereClause: string, params: Array<string>}}
 */
const getSearchWhereClause = (search, fields) => {
    if (!search || !fields || fields.length === 0) {
        return { whereClause: '', params: [] };
    }
    const searchTerm = `%${search}%`;
    const whereClause = ' WHERE ' + fields.map(field => `${field} LIKE ?`).join(' OR ');
    const params = fields.map(() => searchTerm);
    return { whereClause, params };
};

/**
 * 构造用于排序的 ORDER BY 子句
 * @param {string} sortBy - 请求的排序列.
 * @param {Array<string>} allowedSortBy - 允许的排序列数组.
 * @param {string} defaultSortBy - 默认的排序列.
 * @param {string} sortOrder - 排序顺序 ('asc' or 'desc').
 * @returns {string}
 */
const getSortClause = (sortBy, allowedSortBy, defaultSortBy, sortOrder) => {
    const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : defaultSortBy;
    const safeSortOrder = sortOrder?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    return ` ORDER BY ${safeSortBy} ${safeSortOrder}`;
};


module.exports = {
    getSearchWhereClause,
    getSortClause,
};