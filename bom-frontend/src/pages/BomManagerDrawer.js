// src/pages/BomManagerDrawer.js (已优化文件名处理逻辑)
import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Button, List, Space, Popconfirm, message, Typography, Divider, Table, Modal, Upload, Card, Tag } from 'antd';
import { PlusOutlined, DownloadOutlined, UploadOutlined, EditOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../api';
import VersionModal from '../components/VersionModal';
import BomLineModal from '../components/BomLineModal';

const { Title, Text } = Typography;

const BomImportModal = ({ visible, onCancel, onOk, versionId }) => {
    const [uploading, setUploading] = useState(false);
    const uploadProps = {
        name: 'file',
        action: `${api.defaults.baseURL}/lines/import/${versionId}`,
        accept: '.xlsx, .xls',
        showUploadList: false,
        onChange(info) {
            if (info.file.status === 'uploading') {
                setUploading(true);
                return;
            }
            setUploading(false);
            if (info.file.status === 'done') {
                message.success(info.file.response.message || 'BOM导入成功！');
                onOk();
            } else if (info.file.status === 'error') {
                message.error(info.file.response?.error || 'BOM导入失败。');
            }
        },
    };
    return (
        <Modal
            title="导入BOM结构"
            open={visible}
            onCancel={onCancel}
            footer={[<Button key="back" onClick={onCancel}>关闭</Button>]}
            destroyOnClose
        >
            <p><strong>重要：</strong>本次导入将会<strong>覆盖</strong>当前版本的所有BOM行。</p>
            <p>请上传格式与模板一致的Excel文件。</p>
            <br />
            <a href={`${api.defaults.baseURL}/lines/template`} download>下载导入模板</a>
            <br />
            <br />
            <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />} style={{ width: '100%' }} loading={uploading}>
                    {uploading ? '正在上传并处理...' : '点击选择文件并开始导入'}
                </Button>
            </Upload>
        </Modal>
    );
};

const BomManagerDrawer = ({ visible, onClose, material }) => {
    const [versions, setVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [bomLines, setBomLines] = useState([]);
    const [loadingLines, setLoadingLines] = useState(false);
    const [isLineModalVisible, setIsLineModalVisible] = useState(false);
    const [editingLine, setEditingLine] = useState(null);
    const [lineModalContext, setLineModalContext] = useState({ versionId: null, parentId: null });
    const [isVersionModalVisible, setIsVersionModalVisible] = useState(false);
    const [versionTarget, setVersionTarget] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [editingVersion, setEditingVersion] = useState(null);
    const [selectedLineKeys, setSelectedLineKeys] = useState([]);
    const [exportingBOM, setExportingBOM] = useState(false);

    const findLineById = useCallback((lines, id) => {
        for (const line of lines) {
            if (line.id === id) return line;
            if (line.children) {
                const found = findLineById(line.children, id);
                if (found) return found;
            }
        }
        return null;
    }, []);

    const fetchVersionsAndSetState = useCallback(async (materialId, selectVersionId = null) => {
        setLoadingVersions(true);
        try {
            const response = await api.get(`/versions/material/${materialId}`);
            const fetchedVersions = response.data;
            setVersions(fetchedVersions);
            let versionToSelect = fetchedVersions.find(v => v.id === selectVersionId) || fetchedVersions.find(v => v.is_active) || fetchedVersions[0] || null;

            if (selectedVersion?.id !== versionToSelect?.id) {
                setSelectedLineKeys([]);
            }
            setSelectedVersion(versionToSelect);

        } catch (error) { message.error('加载BOM版本失败'); }
        finally { setLoadingVersions(false); }
    }, [selectedVersion]);

    const fetchBomLines = useCallback(async () => {
        if (!selectedVersion) {
            setBomLines([]);
            return;
        }
        setLoadingLines(true);
        try {
            const response = await api.get(`/lines/version/${selectedVersion.id}`);
            setBomLines(response.data);
            return response.data;
        } catch (error) {
            message.error('加载BOM清单失败');
            return [];
        }
        finally { setLoadingLines(false); }
    }, [selectedVersion]);

    useEffect(() => {
        if (visible && material) {
            fetchVersionsAndSetState(material.id);
        }
    }, [visible, material, fetchVersionsAndSetState]);

    useEffect(() => {
        if (selectedVersion) {
            fetchBomLines();
        } else {
            setBomLines([]);
        }
    }, [selectedVersion, fetchBomLines]);

    const handleOpenLineModal = (line = null, parentId = null) => {
        setEditingLine(line);
        setLineModalContext({ versionId: selectedVersion?.id, parentId: parentId || line?.parent_line_id });
        setIsLineModalVisible(true);
    };

    const handleVersionModalOk = async (values, versionToEdit) => {
        try {
            if (versionToEdit) {
                await api.put(`/versions/${versionToEdit.id}`, { ...values, material_id: versionToEdit.material_id });
                message.success('版本更新成功');
                setIsVersionModalVisible(false);
                await fetchVersionsAndSetState(material.id, versionToEdit.id);
            } else {
                if (!versionTarget) return;
                const targetForNewLine = versionTarget;
                const fullVersionCode = `${targetForNewLine.material_code || targetForNewLine.component_code}_V${values.version_suffix}`;
                const response = await api.post('/versions', {
                    material_id: targetForNewLine.id || targetForNewLine.component_id,
                    version_code: fullVersionCode,
                    remark: values.remark || '',
                    is_active: values.is_active,
                });
                message.success('新版本创建成功');
                const newVersion = response.data;
                setIsVersionModalVisible(false);

                if (targetForNewLine.parent_line_id) {
                    setSelectedLineKeys([targetForNewLine.parent_line_id]);
                    setEditingLine(null);
                    setLineModalContext({ versionId: newVersion.id, parentId: targetForNewLine.parent_line_id });
                    setIsLineModalVisible(true);
                }

                await fetchVersionsAndSetState(material.id, selectedVersion?.id);
            }
        } catch (error) {
            message.error(error.response?.data?.error || '操作失败');
        }
    };

    const handleActivateVersion = async (version) => {
        if (version.is_active) return;
        try {
            await api.put(`/versions/${version.id}`, { is_active: true, remark: version.remark, material_id: version.material_id });
            message.success(`${version.version_code} 已激活`);
            fetchVersionsAndSetState(material.id, version.id);
        } catch (error) { message.error('激活失败'); }
    };

    const openVersionModal = (version = null) => {
        setEditingVersion(version);
        setVersionTarget(material);
        setIsVersionModalVisible(true);
    };

    const handleVersionDelete = async (versionId) => {
        try {
            await api.delete(`/versions/${versionId}`);
            message.success('BOM版本删除成功');
            fetchVersionsAndSetState(material.id);
        } catch (error) { message.error(error.response?.data?.error || '删除失败'); }
    };

    const handleLineModalOk = async (values, lineId) => {
        try {
            setIsLineModalVisible(false);
            if (lineId) {
                await api.put(`/lines/${lineId}`, values);
                message.success('BOM行更新成功');
                const updateLineInTree = (lines, id, newValues) => {
                    return lines.map(line => {
                        if (line.id === id) { return { ...line, ...newValues }; }
                        if (line.children?.length > 0) {
                            const updatedChildren = updateLineInTree(line.children, id, newValues);
                            const sortedChildren = [...updatedChildren].sort((a, b) => String(a.position_code).localeCompare(String(b.position_code), undefined, { numeric: true, sensitivity: 'base' }));
                            return { ...line, children: sortedChildren };
                        }
                        return line;
                    });
                };
                setBomLines(currentBomLines => {
                    const updatedTree = updateLineInTree(currentBomLines, lineId, values);
                    updatedTree.sort((a, b) => String(a.position_code).localeCompare(String(b.position_code), undefined, { numeric: true, sensitivity: 'base' }));
                    return updatedTree;
                });
                setSelectedLineKeys([lineId]);
            } else {
                const response = await api.post('/lines', values);
                message.success('BOM行新增成功');
                const newLine = response.data;
                await fetchBomLines();

                if (values.parent_line_id) {
                    setSelectedLineKeys([values.parent_line_id]);
                } else {
                    setSelectedLineKeys([newLine.id]);
                }
            }
        } catch (error) { message.error(error.response?.data?.error || '操作失败'); }
    };

    const handleLineDelete = async () => {
        try {
            await Promise.all(selectedLineKeys.map(id => api.delete(`/lines/${id}`)));
            message.success('BOM行删除成功');
            fetchBomLines();
            setSelectedLineKeys([]);
        } catch (error) { message.error(error.response?.data?.error || '删除失败，请先删除子项。'); }
    };

    const handleAddSubItem = (record) => {
        if (!record) return;
        if (record.component_active_version_id) {
            handleOpenLineModal(null, record.id);
        } else {
            setVersionTarget({ id: record.component_id, material_code: record.component_code, name: record.component_name, parent_line_id: record.id });
            setIsVersionModalVisible(true);
        }
    };

    const lineRowSelection = {
        selectedRowKeys: selectedLineKeys,
        onChange: setSelectedLineKeys,
    };

    const handleExportActiveBomDrawings = async () => {
        if (!material || !material.id) {
            message.warning('没有有效的物料用于导出。');
            return;
        }
        setExportingBOM(true);
        message.info('正在后台为您打包该物料的激活BOM层级图纸，请稍候...');
        try {
            const materialId = material.id;
            const response = await api.post('/drawings/export-bom', { materialId }, { responseType: 'blob' });

            const contentDisposition = response.headers['content-disposition'];
            let fileName = `BOM_Drawings_Export_${Date.now()}.zip`; // 默认备用文件名

            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
                if (filenameMatch && filenameMatch[1]) {
                    fileName = decodeURIComponent(filenameMatch[1]);
                } else {
                    const fallbackMatch = contentDisposition.match(/filename="([^"]+)"/i);
                    if (fallbackMatch && fallbackMatch[1]) {
                        fileName = fallbackMatch[1];
                    }
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
            const errorMsg = await error.response?.data?.text?.() || error.response?.data?.error || '导出BOM层级图纸失败';
            message.error(errorMsg);
        } finally {
            setExportingBOM(false);
        }
    };

    const handleExportExcel = () => {
        if (!selectedVersion) return;
        setExporting(true);
        api.get(`/lines/export/${selectedVersion.id}`, { responseType: 'blob' })
            .then(response => {
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `BOM_${selectedVersion.version_code}.xlsx`);
                document.body.appendChild(link);
                link.click();
                link.remove();
            })
            .catch(() => message.error("导出失败"))
            .finally(() => setExporting(false));
    };

    const handleImportOk = () => {
        setIsImportModalVisible(false);
        fetchBomLines();
    };

    const bomLineColumns = [
        { title: '层级', dataIndex: 'level', key: 'level', width: 80, showSorterTooltip: false },
        { title: '位置编号', dataIndex: 'display_position_code', key: 'display_position_code', width: 120, showSorterTooltip: false },
        { title: '子件编码', dataIndex: 'component_code', key: 'component_code', width: 150, showSorterTooltip: false },
        { title: '子件名称', dataIndex: 'component_name', key: 'component_name' },
        { title: '规格', dataIndex: 'component_spec', key: 'component_spec' },
        { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 100 },
        { title: '单位', dataIndex: 'component_unit', key: 'component_unit', width: 80 },
    ];

    return (
        <>
            <Drawer
                title={<>BOM 管理: <Text strong>{material?.name}</Text> (<Text type="secondary">{material?.material_code}</Text>)</>}
                width={'70%'}
                onClose={onClose}
                open={visible}
                destroyOnClose
                bodyStyle={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '16px' }}
            >
                {/* --- 区域1: BOM版本列表 (有最大高度，可滚动) --- */}
                <Card
                    title="BOM 版本"
                    extra={<Button onClick={() => openVersionModal()} type="primary" size="small" icon={<PlusOutlined />}>新增版本</Button>}
                    style={{ flexShrink: 0 }}
                    bodyStyle={{ padding: '0 1px' }}
                >
                    <div style={{ maxHeight: '30vh', overflow: 'auto' }}>
                        <List
                            loading={loadingVersions}
                            dataSource={versions}
                            renderItem={item => (
                                <List.Item
                                    actions={[
                                        <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleActivateVersion(item)} disabled={item.is_active}>激活</Button>,
                                        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openVersionModal(item)}>编辑</Button>,
                                        <Popconfirm title="确定删除此版本吗?" onConfirm={() => handleVersionDelete(item.id)}><Button type="link" size="small" danger>删除</Button></Popconfirm>
                                    ]}
                                    style={{ cursor: 'pointer', padding: '8px 16px', backgroundColor: selectedVersion?.id === item.id ? '#e6f7ff' : 'transparent' }}
                                    onClick={() => setSelectedVersion(item)}
                                >
                                    <List.Item.Meta title={<Space>{item.version_code} {item.is_active && <Tag color="green">当前激活</Tag>}</Space>} description={item.remark || '无备注'} />
                                </List.Item>
                            )}
                        />
                    </div>
                </Card>

                {/* --- 区域2: BOM结构 (占据剩余空间，内部分为固定头部和滚动表格) --- */}
                <Card
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
                >
                    <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Title level={5} style={{ margin: 0 }}>BOM 结构 (版本: {selectedVersion?.version_code || 'N/A'})</Title>
                            <Space>
                                <Button size="small" onClick={() => handleOpenLineModal(null, null)} type="primary" icon={<PlusOutlined />} disabled={!selectedVersion}>添加根物料</Button>
                                <Button size="small" onClick={() => setIsImportModalVisible(true)} icon={<UploadOutlined />} disabled={!selectedVersion}>导入</Button>
                                <Button size="small" onClick={handleExportExcel} icon={<DownloadOutlined />} disabled={!selectedVersion || bomLines.length === 0} loading={exporting}>导出</Button>
                                <Button size="small" onClick={handleExportActiveBomDrawings} icon={<FileZipOutlined />} disabled={!material} loading={exportingBOM}>导出图纸</Button>
                            </Space>
                        </div>
                        <div style={{ minHeight: '32px', display: 'flex', alignItems: 'center', marginTop: '8px' }}>
                            {selectedLineKeys.length > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <Text strong>已选择 {selectedLineKeys.length} 项</Text>
                                    <Space>
                                        <Button size="small" icon={<EditOutlined />} disabled={selectedLineKeys.length !== 1} onClick={() => handleOpenLineModal(findLineById(bomLines, selectedLineKeys[0]))}>编辑</Button>
                                        <Popconfirm title="确定删除选中的行吗? (若有子项将无法删除)" onConfirm={handleLineDelete} disabled={selectedLineKeys.length === 0}><Button size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
                                        <Button size="small" disabled={selectedLineKeys.length !== 1} onClick={() => handleAddSubItem(findLineById(bomLines, selectedLineKeys[0]))}>添加子项</Button>
                                    </Space>
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ flex: 1, overflow: 'auto' }}>
                        <Table
                            columns={bomLineColumns}
                            dataSource={bomLines}
                            rowKey="id"
                            loading={loadingLines}
                            pagination={false}
                            size="small"
                            rowSelection={lineRowSelection}
                            sticky
                            onRow={(record) => ({
                                onClick: (event) => {
                                    if (event.target.className.includes('ant-table-row-expand-icon')) { return; }
                                    if (window.getSelection().toString()) { return; }
                                    setSelectedLineKeys([record.id]);
                                },
                            })}
                        />
                    </div>
                </Card>
            </Drawer>

            <VersionModal visible={isVersionModalVisible} onCancel={() => setIsVersionModalVisible(false)} onOk={handleVersionModalOk} targetMaterial={versionTarget} editingVersion={editingVersion} />
            {isLineModalVisible && <BomLineModal visible={isLineModalVisible} onCancel={() => setIsLineModalVisible(false)} onOk={handleLineModalOk} editingLine={editingLine} versionId={lineModalContext.versionId} parentId={lineModalContext.parentId} />}
            {selectedVersion && <BomImportModal visible={isImportModalVisible} onCancel={() => setIsImportModalVisible(false)} onOk={handleImportOk} versionId={selectedVersion.id} />}
        </>
    );
};

export default BomManagerDrawer;