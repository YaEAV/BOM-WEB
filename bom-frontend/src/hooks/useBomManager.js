import { useReducer, useCallback, useEffect } from 'react';
import { message } from 'antd';
import api from '../api';
import { versionService } from '../services/versionService';

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
        case 'SET_BOM_LINES':
            return { ...state, bomLines: action.payload, selectedLineKeys: [] };
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

    // ======================= 核心修改 #1: 在Hook中获取版本列表 =======================
    const fetchVersions = useCallback(async () => {
        if (!material?.id) return;
        dispatch({ type: 'SET_LOADING', payload: { versions: true } });
        try {
            const response = await api.get(`/versions/material/${material.id}`);
            const loadedVersions = response.data || [];
            dispatch({ type: 'SET_VERSIONS', payload: loadedVersions });

            // 自动选择版本
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

    // Effect: 当 material.id 变化时，重新获取版本列表
    useEffect(() => {
        fetchVersions();
    }, [fetchVersions]);

    // ======================= 核心修改 #2: 获取BOM树数据的逻辑 =======================
    const fetchBomLines = useCallback(async (versionId) => {
        if (!versionId) {
            dispatch({ type: 'SET_BOM_LINES', payload: [] });
            return;
        }
        dispatch({ type: 'SET_LOADING', payload: { bom: true } });
        try {
            const response = await api.get(`/lines/version/${versionId}`);
            dispatch({ type: 'SET_BOM_LINES', payload: response.data || [] });
        } catch (error) {
            console.error('Failed to fetch BOM tree:', error);
            message.error('加载BOM明细失败。');
        } finally {
            dispatch({ type: 'SET_LOADING', payload: { bom: false } });
        }
    }, []);

    // Effect: 当选择的版本变化时，获取对应的BOM树
    useEffect(() => {
        if (state.selectedVersion) {
            fetchBomLines(state.selectedVersion.id);
        } else {
            dispatch({ type: 'SET_BOM_LINES', payload: [] });
        }
    }, [state.selectedVersion, fetchBomLines]);

    // ======================= 核心修改 #3: 业务逻辑函数 =======================
    const handleVersionModalOk = useCallback(async (values, versionToEdit, isCopy) => {
        let newVersion = null;
        try {
            if (isCopy) {
                await versionService.copy(versionToEdit.id, values);
                message.success('版本复制成功');
            } else if (versionToEdit) {
                await versionService.update(versionToEdit.id, { ...values, material_id: versionToEdit.material_id });
                message.success('版本更新成功');
            } else {
                // 创建新版本
                const targetMaterial = state.versionModal.context?.targetMaterial || material;
                if (!targetMaterial) return;

                // --- 核心修正：智能地获取正确的物料ID和编码 ---
                const materialId = targetMaterial.component_id || targetMaterial.id;
                const materialCode = targetMaterial.component_code || targetMaterial.material_code;

                if (!materialId || !materialCode) {
                    message.error("无法确定目标物料，操作已取消。");
                    return;
                }

                const fullVersionCode = `${materialCode}_V${values.version_suffix}`;
                const response = await versionService.create({
                    material_id: materialId, // 使用修正后的 materialId
                    version_code: fullVersionCode,
                    remark: values.remark || '',
                    is_active: values.is_active,
                });
                newVersion = response.data;
                message.success('新版本创建成功');
            }
            dispatch({ type: 'HIDE_MODALS' });

            if (state.versionModal.context?.purpose === 'ADD_CHILD' && newVersion) {
                dispatch({
                    type: 'SHOW_LINE_MODAL',
                    payload: {
                        line: null,
                        context: {
                            versionId: newVersion.id,
                            parentId: null,
                        }
                    }
                });
                if(state.selectedVersion) {
                    fetchBomLines(state.selectedVersion.id);
                }
            } else {
                fetchVersions();
            }
        } catch (error) { /* 全局拦截器已处理 */ }
    }, [material, state.versionModal.context, state.selectedVersion, fetchVersions, fetchBomLines]);

    const handleDeleteVersion = useCallback(async (versionId) => {
        try {
            await versionService.delete([versionId]);
            message.success('BOM版本已移至回收站');
            fetchVersions(); // 重新加载版本列表
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

    const handleDeleteLines = useCallback(async () => {
        if (!state.selectedLineKeys || state.selectedLineKeys.length === 0) return;
        try {
            const idsToDelete = state.selectedLineKeys.map(key => key.split('-').pop());
            await api.post('/lines/delete', { ids: idsToDelete });
            message.success('BOM行已移至回收站');
            if (state.selectedVersion) {
                fetchBomLines(state.selectedVersion.id);
            }
        } catch (error) { /* 全局拦截器已处理 */ }
    }, [state.selectedLineKeys, state.selectedVersion, fetchBomLines]);

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


    // 将状态和操作函数统一返回
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
        refreshBomLines: () => state.selectedVersion ? fetchBomLines(state.selectedVersion.id) : Promise.resolve(),
    };
};