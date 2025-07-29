// src/hooks/useBomManager.js (最终功能增强版)
import { useReducer, useCallback, useEffect } from 'react';
import { message } from 'antd';
import api from '../api';
import { versionService } from '../services/versionService';
import { findPrecedingKey } from '../utils/bomUtils'; // 引入新的工具函数

// 初始状态定义
const initialState = {
    versions: [],
    bomLines: [],
    loading: { versions: false, bom: false, exportingExcel: false, exportingDrawings: false },
    selectedVersion: null,
    selectedLineKeys: [],
    expandedRowKeys: [],
    versionModal: { visible: false, isCopy: false, version: null, context: null },
    lineModal: { visible: false, line: null, context: {} },
    importModalVisible: false,
};

// Reducer函数，负责所有状态的更新
function bomReducer(state, action) {
    switch (action.type) {
        case 'SET_LOADING':
            return { ...state, loading: { ...state.loading, ...action.payload } };
        case 'SET_VERSIONS':
            return { ...state, versions: action.payload };
        case 'SET_EXPORTING':
            return { ...state, loading: { ...state.loading, [action.payload.type]: action.payload.status } };
        // 【修改】增加 preserveSelection 选项，用于在刷新BOM时决定是否保留选中状态
        case 'SET_BOM_LINES':
            return {
                ...state,
                bomLines: action.payload,
                selectedLineKeys: action.meta?.preserveSelection ? state.selectedLineKeys : []
            };
        case 'SET_SELECTED_VERSION':
            return { ...state, selectedVersion: action.payload, selectedLineKeys: [], expandedRowKeys: [] };
        case 'SET_SELECTED_LINES':
            return { ...state, selectedLineKeys: action.payload };
        case 'SET_EXPANDED_ROWS':
            return { ...state, expandedRowKeys: action.payload };
        case 'SHOW_VERSION_MODAL':
            return { ...state, versionModal: { visible: true, ...action.payload } };
        case 'SHOW_LINE_MODAL':
            return { ...state, lineModal: { visible: true, ...action.payload } };
        case 'SHOW_IMPORT_MODAL':
            return { ...state, importModalVisible: true };
        case 'HIDE_MODALS':
            return {
                ...state,
                versionModal: { visible: false, isCopy: false, version: null },
                lineModal: { visible: false, line: null, context: {} },
                importModalVisible: false
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
}

// 自定义Hook：useBomManager
export const useBomManager = (material, initialVersionId) => {
    const [state, dispatch] = useReducer(bomReducer, initialState);

    const fetchVersions = useCallback(async () => {
        if (!material?.id) return;
        dispatch({ type: 'SET_LOADING', payload: { versions: true } });
        try {
            const response = await versionService.getVersionsByMaterial(material.id);
            const loadedVersions = response.data || [];
            dispatch({ type: 'SET_VERSIONS', payload: loadedVersions });

            if (loadedVersions.length > 0) {
                const versionToSelect =
                    loadedVersions.find(v => v.id === initialVersionId) ||
                    loadedVersions.find(v => v.is_active) ||
                    loadedVersions[0];
                dispatch({ type: 'SET_SELECTED_VERSION', payload: versionToSelect });
            } else {
                dispatch({ type: 'SET_SELECTED_VERSION', payload: null });
            }
        } catch (error) {
            console.error('Failed to fetch versions:', error);
            message.error('加载BOM版本列表失败。');
        } finally {
            dispatch({ type: 'SET_LOADING', payload: { versions: false } });
        }
    }, [material?.id, initialVersionId]);

    useEffect(() => {
        fetchVersions();
    }, [fetchVersions]);

    // 【修改】让 fetchBomLines 接受选项参数
    const fetchBomLines = useCallback(async (versionId, options = {}) => {
        if (!versionId) {
            dispatch({ type: 'SET_BOM_LINES', payload: [] });
            return;
        }
        dispatch({ type: 'SET_LOADING', payload: { bom: true } });
        try {
            const response = await api.get(`/lines/version/${versionId}`);
            dispatch({
                type: 'SET_BOM_LINES',
                payload: response.data || [],
                meta: { preserveSelection: options.preserveSelection }
            });
        } catch (error) {
            console.error('Failed to fetch BOM tree:', error);
            message.error('加载BOM明细失败。');
        } finally {
            dispatch({ type: 'SET_LOADING', payload: { bom: false } });
        }
    }, []);

    useEffect(() => {
        if (state.selectedVersion) {
            fetchBomLines(state.selectedVersion.id);
        } else {
            dispatch({ type: 'SET_BOM_LINES', payload: [] });
        }
    }, [state.selectedVersion, fetchBomLines]);

    // 【修改】实现智能删除逻辑
    const handleDeleteLines = useCallback(async () => {
        if (!state.selectedLineKeys || state.selectedLineKeys.length === 0) return;

        // 1. 在删除前，根据当前树状结构计算出删除后应该选中的新行
        const keyToDelete = state.selectedLineKeys[0]; // 假设主要操作对象是第一个选中项
        const newKeyToSelect = findPrecedingKey(state.bomLines, keyToDelete);

        try {
            const idsToDelete = state.selectedLineKeys.map(key => key.split('-').pop());
            await api.post('/lines/delete', { ids: idsToDelete });
            message.success('BOM行已移至回收站');

            // 2. 刷新BOM数据
            if (state.selectedVersion) {
                await fetchBomLines(state.selectedVersion.id);
            }

            // 3. 应用我们之前计算好的新选中行
            dispatch({ type: 'SET_SELECTED_LINES', payload: newKeyToSelect ? [newKeyToSelect] : [] });

        } catch (error) { /* 全局拦截器已处理 */ }
    }, [state.selectedLineKeys, state.selectedVersion, state.bomLines, fetchBomLines]);

    // 其他未修改的函数
    const handleVersionModalOk = useCallback(async (values, versionToEdit, isCopy) => {
        try {
            if (isCopy) {
                await versionService.copy(versionToEdit.id, values);
                message.success('版本复制成功');
            } else if (versionToEdit) {
                await versionService.update(versionToEdit.id, { ...values, material_id: versionToEdit.material_id });
                message.success('版本更新成功');
            } else {
                const materialId = material?.id;
                const materialCode = material?.material_code;
                if (!materialId || !materialCode) {
                    message.error("无法确定目标物料，操作已取消。");
                    return;
                }
                const fullVersionCode = `${materialCode}_V${values.version_suffix}`;
                await versionService.create({
                    material_id: materialId,
                    version_code: fullVersionCode,
                    remark: values.remark || '',
                    is_active: values.is_active,
                });
                message.success('新版本创建成功');
            }
            dispatch({ type: 'HIDE_MODALS' });
            fetchVersions();
        } catch (error) { /* 全局拦截器已处理 */ }
    }, [material, fetchVersions]);

    const handleDeleteVersion = useCallback(async (versionId) => {
        try {
            await versionService.delete([versionId]);
            message.success('BOM版本已移至回收站');
            fetchVersions();
        } catch (error) { /* 全局拦截器已处理 */ }
    }, [fetchVersions]);

    const handleExportExcel = useCallback(async () => {
        if (!state.selectedVersion) return;
        dispatch({ type: 'SET_EXPORTING', payload: { type: 'exportingExcel', status: true } });
        try {
            const response = await api.get(`/lines/export/${state.selectedVersion.id}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `BOM_${state.selectedVersion.version_code}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            message.error("导出Excel失败");
        } finally {
            dispatch({ type: 'SET_EXPORTING', payload: { type: 'exportingExcel', status: false } });
        }
    }, [state.selectedVersion]);

    const handleExportDrawings = useCallback(async () => {
        if (!material) return;
        dispatch({ type: 'SET_EXPORTING', payload: { type: 'exportingDrawings', status: true } });
        message.info('正在后台为您打包该物料的激活BOM层级图纸，请稍候...');
        try {
            const response = await api.post('/drawings/export-bom', { materialId: material.id }, { responseType: 'blob' });
            const contentDisposition = response.headers['content-disposition'];
            let fileName = `BOM_Drawings_Export_${Date.now()}.zip`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
                if (filenameMatch && filenameMatch[1]) {
                    fileName = decodeURIComponent(filenameMatch[1]);
                } else {
                    const fallbackMatch = contentDisposition.match(/filename="([^"]+)"/i);
                    if (fallbackMatch && fallbackMatch[1]) fileName = fallbackMatch[1];
                }
            }
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            const errorMsg = await error.response?.data?.text?.() || error.response?.data?.error?.message || '导出BOM层级图纸失败';
            message.error(errorMsg);
        } finally {
            dispatch({ type: 'SET_EXPORTING', payload: { type: 'exportingDrawings', status: false } });
        }
    }, [material]);

    const handleLineModalOk = useCallback(async (values, lineToEdit) => {
        try {
            if (lineToEdit) {
                await api.put(`/lines/${lineToEdit.id}`, values);
                message.success('更新成功');
            } else {
                const { versionId, parentId } = state.lineModal.context;
                await api.post('/lines', { ...values, version_id: versionId, parent_line_id: parentId });
                message.success('添加成功');
            }
            dispatch({ type: 'HIDE_MODALS' });
            if (state.selectedVersion) {
                fetchBomLines(state.selectedVersion.id);
            }
        } catch (error) { /* 全局拦截器已处理 */ }
    }, [state.lineModal.context, state.selectedVersion, fetchBomLines]);

    return {
        state,
        dispatch,
        handleExportExcel,
        handleExportDrawings,
        handleVersionModalOk,
        handleDeleteVersion,
        handleLineModalOk,
        handleDeleteLines,
        refreshVersions: fetchVersions,
        // 【修改】让 refreshBomLines 能接受选项参数
        refreshBomLines: (options) => state.selectedVersion ? fetchBomLines(state.selectedVersion.id, options) : Promise.resolve(),
    };
};