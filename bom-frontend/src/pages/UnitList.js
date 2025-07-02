// src/pages/UnitList.js (已更新为无限滚动和统一交互)
import React, { useState } from 'react';
import { Table, Modal, Form, Input, message, Spin } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { unitService } from '../services/unitService';
import ListPageToolbar from '../components/ListPageToolbar';
import api from '../api';

const UnitList = () => {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingUnit, setEditingUnit] = useState(null);
    const [form] = Form.useForm();
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    const {
        data: units,
        loading,
        hasMore,
        handleScroll,
        research,
        refresh,
    } = useInfiniteScroll(unitService.getUnits);

    const handleSearch = (value) => {
        research({ search: value });
    };

    const showModal = (unit = null) => {
        setEditingUnit(unit);
        form.setFieldsValue(unit || { name: '' });
        setIsModalVisible(true);
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingUnit) {
                await api.put(`/units/${editingUnit.id}`, values);
                message.success('更新成功');
            } else {
                await api.post('/units', values);
                message.success('创建成功');
            }
            setIsModalVisible(false);
            refresh();
        } catch (error) { message.error(error.response?.data?.error?.message || '操作失败'); }
    };

    const handleDelete = async () => {
        try {
            await api.post(`/units/delete`, { ids: selectedRowKeys });
            message.success(`成功删除 ${selectedRowKeys.length} 个单位`);
            setSelectedRowKeys([]);
            refresh();
        } catch (error) { message.error(error.response?.data?.error?.message || '删除失败'); }
    };

    const columns = [{ title: '单位名称', dataIndex: 'name', key: 'name', sorter: true, showSorterTooltip: false }];

    const singleSelected = selectedRowKeys.length === 1;
    const unit = singleSelected ? units.find(u => u.id === selectedRowKeys[0]) : null;

    const toolbarButtons = [
        ...(selectedRowKeys.length > 0 ? [
            { text: '编辑', icon: <EditOutlined />, onClick: () => showModal(unit), disabled: !singleSelected },
            { text: '删除', icon: <DeleteOutlined />, danger: true, isConfirm: true, confirmTitle: `确定删除选中的 ${selectedRowKeys.length} 项吗?`, onClick: handleDelete, disabled: selectedRowKeys.length === 0 },
        ] : []),
        { text: '新增单位', icon: <PlusOutlined />, type: 'primary', onClick: () => showModal() },
    ];

    return (
        <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
            <ListPageToolbar
                searchPlaceholder="搜索单位名称..."
                onSearch={handleSearch}
                selectedCount={selectedRowKeys.length}
                buttons={toolbarButtons}
            />
            <div id="scrollableDiv" onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    columns={columns}
                    dataSource={units}
                    rowKey="id"
                    loading={loading && units.length === 0}
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
                            {loading && units.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && units.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
                />
            </div>
            <Modal title={editingUnit ? '编辑单位' : '新增单位'} open={isModalVisible} onOk={handleOk} onCancel={() => setIsModalVisible(false)} destroyOnHidden>
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="单位名称" rules={[{ required: true }]}><Input /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
};
export default UnitList;