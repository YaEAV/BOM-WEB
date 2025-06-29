import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Drawer, Button, List, Space, Popconfirm, message, Typography, Divider, Table, Modal, Form, Input, InputNumber, Select, Spin, Upload, Switch } from 'antd';
import { PlusOutlined, DownloadOutlined, UploadOutlined, EditOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../api';

const { Title, Text } = Typography;
const { Option } = Select;

// --- 子组件: BomLineModal, AddVersionModal (保持不变) ---
const BomLineModal = ({ visible, onCancel, onOk, editingLine, versionId, parentId }) => {
    const [form] = Form.useForm();
    const [searching, setSearching] = useState(false);
    const [searchedMaterials, setSearchedMaterials] = useState([]);
    const debounceTimeout = useRef(null);
    useEffect(() => {
        if (visible) {
            if (editingLine) {
                form.setFieldsValue(editingLine);
                setSearchedMaterials([{ id: editingLine.component_id, material_code: editingLine.component_code, name: editingLine.component_name }]);
            } else {
                form.resetFields();
                setSearchedMaterials([]);
            }
        }
    }, [visible, editingLine, form]);
    const handleSearch = (value) => {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        if (!value) { setSearchedMaterials([]); return; }
        setSearching(true);
        debounceTimeout.current = setTimeout(async () => {
            try {
                const response = await api.get('/materials/search', { params: { term: value } });
                setSearchedMaterials(response.data);
            } catch (error) { message.error('搜索物料失败'); }
            finally { setSearching(false); }
        }, 500);
    };
    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            onOk({ ...values, version_id: versionId, parent_line_id: parentId || null }, editingLine?.id);
        } catch (error) { console.log('Validation Failed:', error); }
    };
    return (
        <Modal title={editingLine ? '编辑BOM行' : '新增BOM行'} open={visible} onCancel={onCancel} onOk={handleModalOk} destroyOnHidden width={600}>
            <Form form={form} layout="vertical">
                <Form.Item name="position_code" label="位置编号 (在当前层级)" rules={[{ required: true, message: '请输入位置编号!' }]}>
                    <Input placeholder="例如: 1, 2, A, 13KN..." />
                </Form.Item>
                <Form.Item name="component_id" label="子件" rules={[{ required: true, message: '请选择一个子件!' }]}>
                    <Select showSearch placeholder="搜索物料编码或名称" onSearch={handleSearch} filterOption={false} notFoundContent={searching ? <Spin size="small" /> : '无匹配结果'}>
                        {searchedMaterials.map(d => <Option key={d.id} value={d.id}>{`${d.material_code} - ${d.name}`}</Option>)}
                    </Select>
                </Form.Item>
                <Form.Item name="quantity" label="用量" rules={[{ required: true, message: '请输入用量!' }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="process_info" label="工艺说明"><Input /></Form.Item>
                <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
            </Form>
        </Modal>
    );
};

// --- MODIFICATION START ---
// 2. 将 AddVersionModal 改为 VersionModal，以支持新增和编辑
const VersionModal = ({ visible, onCancel, onOk, targetMaterial, editingVersion }) => {
    const [form] = Form.useForm();

    useEffect(() => {
        if (visible) {
            if (editingVersion) {
                form.setFieldsValue({
                    version_suffix: editingVersion.version_code.split('_V').pop(),
                    remark: editingVersion.remark,
                    is_active: editingVersion.is_active,
                });
            } else {
                form.resetFields();
            }
        }
    }, [visible, editingVersion, form]);

    const handleOk = () => form.validateFields().then(values => onOk(values, editingVersion)).catch(info => console.log('Validate Failed:', info));

    const title = editingVersion ? '编辑BOM版本' : '新增BOM版本';
    const materialCode = editingVersion ? editingVersion.material_code : (targetMaterial?.material_code || targetMaterial?.component_code);

    return (
        <Modal title={title} open={visible} onCancel={onCancel} onOk={handleOk} destroyOnHidden>
            <Form form={form} layout="vertical">
                <Form.Item label="物料编码"><Input value={materialCode} disabled /></Form.Item>
                <Form.Item name="version_suffix" label="版本号后缀" rules={[{ required: true, message: '请输入版本号后缀, 例如: 1.0' }]} help="最终版本号将是: 物料编码_V(后缀)">
                    <Input placeholder="例如: 1.0" disabled={!!editingVersion} />
                </Form.Item>
                <Form.Item name="remark" label="备注"><Input.TextArea rows={4} placeholder="请输入备注信息" /></Form.Item>
                {editingVersion && (
                    <Form.Item name="is_active" label="是否激活" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                )}
            </Form>
        </Modal>
    );
};
// --- MODIFICATION END ---


const BomImportModal = ({ visible, onCancel, onOk, versionId }) => {
    const [uploading, setUploading] = useState(false);
    const uploadProps = {
        name: 'file',
        action: `http://localhost:5000/api/lines/import/${versionId}`,
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
            destroyOnHidden
        >
            <p><strong>重要：</strong>本次导入将会<strong>覆盖</strong>当前版本的所有BOM行。</p>
            <p>请上传格式与模板一致的Excel文件。</p>
            <br />
            <a href="http://localhost:5000/api/lines/template" download>下载导入模板</a>
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
    const [editingVersion, setEditingVersion] = useState(null); // For editing existing versions

    const fetchVersionsAndSetState = useCallback(async (materialId, selectVersionId = null) => {
        setLoadingVersions(true);
        try {
            const response = await api.get(`/versions/material/${materialId}`);
            setVersions(response.data);
            if (selectVersionId) {
                const newSelected = response.data.find(v => v.id === selectVersionId) || response.data.find(v => v.is_active) || response.data[0] || null;
                setSelectedVersion(newSelected);
            } else {
                const activeVersion = response.data.find(v => v.is_active);
                setSelectedVersion(activeVersion || response.data[0] || null);
            }
        } catch (error) {
            message.error('加载BOM版本失败');
        } finally {
            setLoadingVersions(false);
        }
    }, []);

    useEffect(() => {
        if (visible && material) {
            setBomLines([]);
            fetchVersionsAndSetState(material.id);
        }
    }, [visible, material, fetchVersionsAndSetState]);


    const fetchBomLines = useCallback(async () => {
        if (!selectedVersion) {
            setBomLines([]);
            return;
        }
        setLoadingLines(true);
        try {
            const response = await api.get(`/lines/version/${selectedVersion.id}`);
            setBomLines(response.data);
        } catch (error) {
            message.error('加载BOM清单失败');
        } finally {
            setLoadingLines(false);
        }
    }, [selectedVersion]);

    useEffect(() => {
        fetchBomLines();
    }, [fetchBomLines]);

    // --- MODIFICATION START ---
    // 1 & 2: 合并新增和编辑逻辑
    const handleVersionModalOk = async (values, versionToEdit) => {
        try {
            if (versionToEdit) {
                // 编辑逻辑
                await api.put(`/versions/${versionToEdit.id}`, {
                    remark: values.remark,
                    is_active: values.is_active,
                    material_id: versionToEdit.material_id, // 传递 material_id 以便后端处理
                });
                message.success('版本更新成功');
                await fetchVersionsAndSetState(material.id, versionToEdit.id);
            } else {
                // 新增逻辑
                const target = versionTarget;
                if (!target) return;
                const fullVersionCode = `${target.material_code}_V${values.version_suffix}`;
                const response = await api.post('/versions', {
                    material_id: target.id,
                    version_code: fullVersionCode,
                    remark: values.remark || '',
                    is_active: true, // 1. 新增时默认激活
                });
                message.success('新版本创建成功');
                await fetchVersionsAndSetState(material.id, response.data.id);
            }
            setIsVersionModalVisible(false);
            setEditingVersion(null);
        } catch (error) {
            message.error(error.response?.data?.error || '操作失败');
        }
    };

    const handleActivateVersion = async (version) => {
        if (version.is_active) return;
        try {
            await api.put(`/versions/${version.id}`, {
                is_active: true,
                remark: version.remark,
                material_id: version.material_id
            });
            message.success(`${version.version_code} 已激活`);
            await fetchVersionsAndSetState(material.id, version.id);
        } catch (error) {
            message.error('激活失败');
        }
    };

    const openVersionModal = (version = null) => {
        if (version) {
            setEditingVersion(version); // 设置为编辑模式
        } else {
            setVersionTarget(material); // 设置为新增模式
            setEditingVersion(null);
        }
        setIsVersionModalVisible(true);
    };
    // --- MODIFICATION END ---


    const handleVersionDelete = async (versionId) => {
        try {
            await api.delete(`/versions/${versionId}`);
            message.success('BOM版本删除成功');
            await fetchVersionsAndSetState(material.id);
        } catch (error) { message.error('删除失败'); }
    };

    const handleOpenLineModal = (line = null, parentId = null, versionId = null) => {
        setEditingLine(line);
        setLineModalContext({
            versionId: versionId || line?.version_id || selectedVersion?.id,
            parentId: parentId || line?.parent_line_id
        });
        setIsLineModalVisible(true);
    };

    const handleLineModalOk = async (values, lineId) => {
        try {
            if (lineId) {
                await api.put(`/lines/${lineId}`, values);
                message.success('BOM行更新成功');
            } else {
                await api.post('/lines', values);
                message.success('BOM行新增成功');
            }
            setIsLineModalVisible(false);
            fetchBomLines();
        } catch (error) { message.error(error.response?.data?.error || '操作失败'); }
    };

    const handleLineDelete = async (lineId) => {
        try {
            await api.delete(`/lines/${lineId}`);
            message.success('BOM行删除成功');
            fetchBomLines();
        } catch (error) { message.error(error.response?.data?.error || '删除失败'); }
    };

    const handleAddSubItem = (record) => {
        if (record.component_active_version_id) {
            handleOpenLineModal(null, record.id, record.component_active_version_id);
        } else {
            setVersionTarget({
                id: record.component_id,
                material_code: record.component_code
            });
            setIsVersionModalVisible(true);
        }
    };

    const handleExportExcel = () => {
        if (!selectedVersion) return;
        setExporting(true);
        window.open(`http://localhost:5000/api/lines/export/${selectedVersion.id}`);
        setExporting(false);
    };

    const handleImportOk = () => {
        setIsImportModalVisible(false);
        fetchBomLines();
    };

    const bomLineColumns = [
        { title: '层级', dataIndex: 'level', key: 'level', width: 80 },
        { title: '位置编号', dataIndex: 'display_position_code', key: 'display_position_code', width: 120 },
        { title: '子件编码', dataIndex: 'component_code', key: 'component_code', width: 150 },
        { title: '子件名称', dataIndex: 'component_name', key: 'component_name' },
        { title: '规格', dataIndex: 'component_spec', key: 'component_spec' },
        { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 100 },
        { title: '单位', dataIndex: 'component_unit', key: 'component_unit', width: 80 },
        {
            title: '操作', key: 'action', fixed: 'right', width: 180,
            render: (_, record) => (
                <Space size="small">
                    <a onClick={() => handleOpenLineModal(record)}>编辑</a>
                    <Popconfirm title="确定删除此行吗?" onConfirm={() => handleLineDelete(record.id)}><a>删除</a></Popconfirm>
                    <a onClick={() => handleAddSubItem(record)}>添加子项</a>
                </Space>
            ),
        },
    ];

    return (
        <>
            <Drawer title={<>BOM 管理: <Text strong>{material?.name}</Text> (<Text type="secondary">{material?.material_code}</Text>)</>} width={'70%'} onClose={onClose} open={visible} destroyOnHidden>
                <Title level={5}>BOM 版本</Title>
                <Button onClick={() => openVersionModal(null)} type="primary" size="small" icon={<PlusOutlined />} style={{ marginBottom: 16 }}>新增版本</Button>
                <List
                    loading={loadingVersions}
                    dataSource={versions}
                    renderItem={item => (
                        <List.Item
                            // --- MODIFICATION START ---
                            // 2. 添加编辑和激活按钮
                            actions={[
                                <Button type="link" icon={<CheckCircleOutlined />} onClick={() => handleActivateVersion(item)} disabled={item.is_active}>激活</Button>,
                                <Button type="link" icon={<EditOutlined />} onClick={() => openVersionModal(item)}>编辑</Button>,
                                <Popconfirm title="确定删除此版本吗?" onConfirm={() => handleVersionDelete(item.id)}><Button type="link" danger>删除</Button></Popconfirm>
                            ]}
                            // --- MODIFICATION END ---
                            style={{ cursor: 'pointer', padding: '8px 16px', backgroundColor: selectedVersion?.id === item.id ? '#e6f7ff' : 'transparent' }}
                            onClick={() => setSelectedVersion(item)}
                        >
                            <List.Item.Meta title={<Space>{item.version_code} {item.is_active && <Text type="success">(当前激活)</Text>}</Space>} description={item.remark || '无备注'} />
                        </List.Item>
                    )}
                />
                <Divider />
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Title level={5} style={{ margin: 0 }}>BOM 结构 (版本: {selectedVersion?.version_code || 'N/A'})</Title>
                    <Space>
                        <Button onClick={() => setIsImportModalVisible(true)} icon={<UploadOutlined />} disabled={!selectedVersion}>导入BOM</Button>
                        <Button onClick={handleExportExcel} icon={<DownloadOutlined />} disabled={!selectedVersion || bomLines.length === 0 || exporting} loading={exporting}>导出Excel</Button>
                        <Button onClick={() => handleOpenLineModal(null, null, selectedVersion?.id)} type="primary" icon={<PlusOutlined />} disabled={!selectedVersion}>添加根物料</Button>
                    </Space>
                </Space>
                <Table columns={bomLineColumns} dataSource={bomLines} loading={loadingLines} rowKey="id" pagination={false} size="small" />
            </Drawer>

            <VersionModal
                visible={isVersionModalVisible}
                onCancel={() => { setIsVersionModalVisible(false); setEditingVersion(null); }}
                onOk={handleVersionModalOk}
                targetMaterial={versionTarget}
                editingVersion={editingVersion}
            />
            {isLineModalVisible && ( <BomLineModal visible={isLineModalVisible} onCancel={() => setIsLineModalVisible(false)} onOk={handleLineModalOk} editingLine={editingLine} versionId={lineModalContext.versionId} parentId={lineModalContext.parentId} /> )}
            {selectedVersion && ( <BomImportModal visible={isImportModalVisible} onCancel={() => setIsImportModalVisible(false)} onOk={handleImportOk} versionId={selectedVersion.id} /> )}
        </>
    );
};

export default BomManagerDrawer;