// src/pages/BomManagerDrawer.js (Corrected - Added useState import)
import React, { useState, useEffect, useCallback, useReducer } from 'react';
import { Drawer, Card, message, Typography } from 'antd';

import VersionPanel from '../components/bom/VersionPanel';
import BomToolbar from '../components/bom/BomToolbar';
import BomTable from '../components/bom/BomTable';

import VersionModal from '../components/VersionModal';
import BomLineModal from '../components/BomLineModal';
import BomImportModal from '../components/bom/BomImportModal';

import api from '../api';

const { Text } = Typography;

const findLineById = (lines, id) => {
    for (const line of lines) {
        if (line.id === id) return line;
        if (line.children) {
            const found = findLineById(line.children, id);
            if (found) return found;
        }
    }
    return null;
};

const initialState = {
    versions: [],
    selectedVersion: null,
    bomLines: [],
    loadingLines: false,
    selectedLineKeys: [],
    isVersionModalVisible: false,
    editingVersion: null,
    isLineModalVisible: false,
    editingLine: null,
    lineModalContext: { versionId: null, parentId: null },
    isImportModalVisible: false,
    exportingExcel: false,
    exportingDrawings: false,
};

function bomReducer(state, action) {
    switch (action.type) {
        case 'SET_VERSIONS':
            return { ...state, versions: action.payload };
        case 'SELECT_VERSION':
            return { ...state, selectedVersion: action.payload, selectedLineKeys: [] };
        case 'SET_BOM_LINES':
            return { ...state, bomLines: action.payload, loadingLines: false };
        case 'SET_LOADING_LINES':
            return { ...state, loadingLines: true };
        case 'SET_SELECTED_LINES':
            return { ...state, selectedLineKeys: action.payload };
        case 'SHOW_VERSION_MODAL':
            return { ...state, isVersionModalVisible: true, editingVersion: action.payload };
        case 'SHOW_LINE_MODAL':
            return { ...state, isLineModalVisible: true, editingLine: action.payload.line, lineModalContext: action.payload.context };
        case 'SHOW_IMPORT_MODAL':
            return { ...state, isImportModalVisible: true };
        case 'SET_EXPORTING':
            return { ...state, [action.payload.type]: action.payload.status };
        case 'HIDE_MODALS':
            return { ...state, isVersionModalVisible: false, isLineModalVisible: false, isImportModalVisible: false, editingVersion: null, editingLine: null };
        default:
            return state;
    }
}

const BomManagerDrawer = ({ visible, onClose, material, initialVersionId = null }) => {
    const [state, dispatch] = useReducer(bomReducer, initialState);

    const [versionPanelReloader, setVersionPanelReloader] = useState(0);

    const fetchBomLines = useCallback(async (versionId) => {
        if (!versionId) {
            dispatch({ type: 'SET_BOM_LINES', payload: [] });
            return;
        }
        dispatch({ type: 'SET_LOADING_LINES' });
        try {
            const response = await api.get(`/lines/version/${versionId}`);
            dispatch({ type: 'SET_BOM_LINES', payload: response.data });
        } catch (error) {
            message.error('加载BOM清单失败');
            dispatch({ type: 'SET_BOM_LINES', payload: [] });
        }
    }, []);

    useEffect(() => {
        if (state.selectedVersion) {
            fetchBomLines(state.selectedVersion.id);
        } else {
            dispatch({ type: 'SET_BOM_LINES', payload: [] });
        }
    }, [state.selectedVersion, fetchBomLines]);

    const handleVersionsLoaded = useCallback((loadedVersions) => {
        dispatch({ type: 'SET_VERSIONS', payload: loadedVersions });
        if (loadedVersions.length > 0) {
            let versionToSelect = loadedVersions.find(v => v.id === initialVersionId) ||
                loadedVersions.find(v => v.is_active) ||
                loadedVersions[0] || null;
            dispatch({ type: 'SELECT_VERSION', payload: versionToSelect });
        } else {
            dispatch({ type: 'SELECT_VERSION', payload: null });
        }
    }, [initialVersionId]);

    const handleVersionModalOk = async (values, versionToEdit) => {
        try {
            if (versionToEdit) {
                await api.put(`/versions/${versionToEdit.id}`, { ...values, material_id: versionToEdit.material_id });
                message.success('版本更新成功');
            } else {
                if (!material) return;
                const fullVersionCode = `${material.material_code}_V${values.version_suffix}`;
                await api.post('/versions', {
                    material_id: material.id,
                    version_code: fullVersionCode,
                    remark: values.remark || '',
                    is_active: values.is_active,
                });
                message.success('新版本创建成功');
            }
            setVersionPanelReloader(v => v + 1);
            dispatch({ type: 'HIDE_MODALS' });
        } catch (error) {
            message.error(error.response?.data?.error || '操作失败');
        }
    };

    const handleLineModalOk = async (values, lineId) => {
        try {
            const payload = { ...values, version_id: state.lineModalContext.versionId, parent_line_id: state.lineModalContext.parentId };
            if (lineId) {
                await api.put(`/lines/${lineId}`, payload);
                message.success('BOM行更新成功');
            } else {
                await api.post('/lines', payload);
                message.success('BOM行新增成功');
            }
            dispatch({ type: 'HIDE_MODALS' });
            fetchBomLines(state.selectedVersion.id);
        } catch (error) {
            message.error(error.response?.data?.error || '操作失败');
        }
    };

    const handleDeleteLines = async () => {
        try {
            await Promise.all(state.selectedLineKeys.map(id => api.delete(`/lines/${id}`)));
            message.success('BOM行删除成功');
            dispatch({ type: 'SET_SELECTED_LINES', payload: [] });
            fetchBomLines(state.selectedVersion.id);
        } catch (error) {
            message.error(error.response?.data?.error || '删除失败，请先删除子项。');
        }
    };

    const handleAddSubLine = () => {
        const parentLine = findLineById(state.bomLines, state.selectedLineKeys[0]);
        if (!parentLine) return;
        dispatch({ type: 'SHOW_LINE_MODAL', payload: { line: null, context: { versionId: state.selectedVersion?.id, parentId: parentLine.id } } });
    };

    const handleExportExcel = async () => {
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
            message.error("导出失败");
        } finally {
            dispatch({ type: 'SET_EXPORTING', payload: { type: 'exportingExcel', status: false } });
        }
    };

    const handleExportDrawings = async () => {
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
    };

    return (
        <>
            <Drawer
                title={<>BOM 管理: <Text strong>{material?.name}</Text> (<Text type="secondary">{material?.material_code}</Text>)</>}
                width={'70%'}
                onClose={onClose}
                open={visible}
                destroyOnClose
                bodyStyle={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '16px', backgroundColor: '#f5f5f5' }}
            >
                <VersionPanel
                    key={versionPanelReloader}
                    material={material}
                    selectedVersion={state.selectedVersion}
                    onVersionSelect={(version) => dispatch({ type: 'SELECT_VERSION', payload: version })}
                    onEditVersion={(version) => dispatch({ type: 'SHOW_VERSION_MODAL', payload: version })}
                    onAddVersion={() => dispatch({ type: 'SHOW_VERSION_MODAL', payload: null })}
                    onVersionsLoaded={handleVersionsLoaded}
                />

                <Card
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
                >
                    <BomToolbar
                        selectedVersion={state.selectedVersion}
                        selectedLineKeys={state.selectedLineKeys}
                        onAddRootLine={() => dispatch({ type: 'SHOW_LINE_MODAL', payload: { line: null, context: { versionId: state.selectedVersion?.id, parentId: null } } })}
                        onEditLine={() => dispatch({ type: 'SHOW_LINE_MODAL', payload: { line: findLineById(state.bomLines, state.selectedLineKeys[0]), context: {} } })}
                        onAddSubLine={handleAddSubLine}
                        onDeleteLines={handleDeleteLines}
                        onImport={() => dispatch({ type: 'SHOW_IMPORT_MODAL' })}
                        onExportExcel={handleExportExcel}
                        onExportDrawings={handleExportDrawings}
                        exporting={state.exportingExcel}
                        exportingBOM={state.exportingDrawings}
                    />
                    <BomTable
                        loading={state.loadingLines}
                        bomLines={state.bomLines}
                        selectedLineKeys={state.selectedLineKeys}
                        onSelectionChange={(keys) => dispatch({ type: 'SET_SELECTED_LINES', payload: keys })}
                    />
                </Card>
            </Drawer>

            <VersionModal visible={state.isVersionModalVisible} onCancel={() => dispatch({ type: 'HIDE_MODALS' })} onOk={handleVersionModalOk} targetMaterial={material} editingVersion={state.editingVersion} />
            {state.isLineModalVisible && <BomLineModal visible={state.isLineModalVisible} onCancel={() => dispatch({ type: 'HIDE_MODALS' })} onOk={handleLineModalOk} editingLine={state.editingLine} versionId={state.lineModalContext.versionId} parentId={state.lineModalContext.parentId} />}
            {state.selectedVersion && <BomImportModal visible={state.isImportModalVisible} onCancel={() => dispatch({ type: 'HIDE_MODALS' })} onOk={() => { dispatch({ type: 'HIDE_MODALS' }); fetchBomLines(state.selectedVersion.id); }} versionId={state.selectedVersion.id} />}
        </>
    );
};

export default BomManagerDrawer;