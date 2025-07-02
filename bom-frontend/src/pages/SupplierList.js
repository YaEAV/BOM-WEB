// src/pages/SupplierList.js (已更新为无限滚动和统一交互)
import React, { useState } from 'react';
import { Table, Modal, Form, Input, message, Spin } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { supplierService } from '../services/supplierService';
import ListPageToolbar from '../components/ListPageToolbar';
import api from '../api';

const SupplierList = () => {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [form] = Form.useForm();
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    const {
        data: suppliers,
        loading,
        hasMore,
        handleScroll,
        research,
        refresh,
        setData: setSuppliers
    } = useInfiniteScroll(supplierService.getSuppliers);

    const handleSearch = (value) => {
        research({ search: value });
    };

    const showModal = (supplier = null) => {
        setEditingSupplier(supplier);
        form.setFieldsValue(supplier || { name: '', contact: '', phone: '', address: '', remark: '' });
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingSupplier(null);
        form.resetFields();
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingSupplier) {
                await api.put(`/suppliers/${editingSupplier.id}`, values);
                message.success('更新成功');
            } else {
                await api.post('/suppliers', values);
                message.success('创建成功');
            }
            handleCancel();
            refresh();
        } catch (error) { message.error(error.response?.data?.error?.message || '操作失败'); }
    };

    const handleDelete = async () => {
        try {
            await api.post(`/suppliers/delete`, { ids: selectedRowKeys });
            message.success(`成功删除 ${selectedRowKeys.length} 个供应商`);
            setSelectedRowKeys([]);
            refresh();
        } catch (error) { message.error(error.response?.data?.error?.message || '删除失败'); }
    };

    const columns = [
        { title: '供应商名称', dataIndex: 'name', key: 'name', sorter: true, showSorterTooltip: false },
        { title: '联系人', dataIndex: 'contact', key: 'contact' },
        { title: '电话', dataIndex: 'phone', key: 'phone' },
        { title: '地址', dataIndex: 'address', key: 'address' },
        { title: '备注', dataIndex: 'remark', key: 'remark' },
    ];

    const singleSelected = selectedRowKeys.length === 1;
    const supplier = singleSelected ? suppliers.find(s => s.id === selectedRowKeys[0]) : null;

    const toolbarButtons = [
        ...(selectedRowKeys.length > 0 ? [
            { text: '编辑', icon: <EditOutlined />, onClick: () => showModal(supplier), disabled: !singleSelected },
            { text: '删除', icon: <DeleteOutlined />, danger: true, isConfirm: true, confirmTitle: `确定删除选中的 ${selectedRowKeys.length} 项吗?`, onClick: handleDelete, disabled: selectedRowKeys.length === 0 },
        ] : []),
        { text: '新增供应商', icon: <PlusOutlined />, type: 'primary', onClick: () => showModal() },
    ];

    return (
        <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
            <ListPageToolbar
                searchPlaceholder="搜索供应商或联系人..."
                onSearch={handleSearch}
                selectedCount={selectedRowKeys.length}
                buttons={toolbarButtons}
            />
            <div id="scrollableDiv" onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    columns={columns}
                    dataSource={suppliers}
                    rowKey="id"
                    loading={loading && suppliers.length === 0}
                    rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                    onRow={(record) => ({
                        onClick: () => {
                            if (window.getSelection().toString()) return;
                            setSelectedRowKeys([record.id]);
                        }
                    })}
                    pagination={false}
                    sticky
                    size="small"
                    footer={() => (
                        <>
                            {loading && suppliers.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && suppliers.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
                />
            </div>
            <Modal title={editingSupplier ? '编辑供应商' : '新增供应商'} open={isModalVisible} onOk={handleOk} onCancel={handleCancel} destroyOnHidden>
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="供应商名称" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="contact" label="联系人"><Input /></Form.Item>
                    <Form.Item name="phone" label="电话"><Input /></Form.Item>
                    <Form.Item name="address" label="地址"><Input.TextArea /></Form.Item>
                    <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default SupplierList;