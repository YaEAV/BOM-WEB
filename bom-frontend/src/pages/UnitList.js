// src/pages/UnitList.js (重构后)
import React, { useState } from 'react';
import { Modal, Form, Input } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import GenericListPage from '../components/GenericListPage';
import { unitService } from '../services/unitService';

const UnitList = () => {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingUnit, setEditingUnit] = useState(null);
    const [form] = Form.useForm();

    const showModal = (unit = null) => {
        setEditingUnit(unit);
        form.setFieldsValue(unit || {});
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        form.resetFields();
    };

    const handleOk = (refreshFn) => {
        form.validateFields()
            .then(async (values) => {
                if (editingUnit) {
                    await unitService.update(editingUnit.id, values);
                } else {
                    await unitService.create(values);
                }
                handleCancel();
                refreshFn(); // 直接调用 refresh 函数刷新列表
            })
            .catch(info => {
                console.log('Validate Failed:', info);
            });
    };

    const pageConfig = {
        service: unitService,
        columns: [
            { title: '单位名称', dataIndex: 'name', sorter: true },
        ],
        searchPlaceholder: '搜索单位名称...',
        initialSorter: { field: 'name', order: 'ascend' },
        toolbarButtonsConfig: (selectedRows, refresh, handleAction) => ([
            ...(selectedRows.length > 0 ? [
                { text: '编辑', icon: <EditOutlined />, onClick: () => showModal(selectedRows[0]), disabled: selectedRows.length !== 1 },
                { text: '移至回收站', icon: <DeleteOutlined />, danger: true, isConfirm: true, confirmTitle: `确定删除选中的 ${selectedRows.length} 项吗?`,
                    onClick: () => handleAction(() => unitService.delete(selectedRows.map(r => r.id)), '删除成功'),
                    disabled: selectedRows.length === 0
                },
            ] : []),
            { text: '新增单位', icon: <PlusOutlined />, type: 'primary', onClick: () => showModal() },
        ]),
        moreMenuItemsConfig: () => ([]),
    };

    return (
        <>
            <GenericListPage {...pageConfig} />
            <Modal
                title={editingUnit ? '编辑单位' : '新增单位'}
                open={isModalVisible}
                onOk={() => handleOk(refresh)}
                onCancel={handleCancel}
                destroyOnClose
            >
                <Form form={form} layout="vertical" name="unitForm" onFinish={(values) => handleOk(() => window.location.reload())}>
                    <Form.Item name="name" label="单位名称" rules={[{ required: true, message: '请输入单位名称!' }]}><Input /></Form.Item>
                    <button id="unit-form-submit-button" type="submit" style={{ display: 'none' }}>Submit</button>
                </Form>
            </Modal>
        </>
    );
};

export default UnitList;