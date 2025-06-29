import React, { useEffect } from 'react';
import { Modal, Form, Input, Switch } from 'antd';

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
    const materialCode = editingVersion ? editingVersion.material_code : (targetMaterial?.material_code || targetMaterial?.component_code || '');

    return (
        <Modal
            title={title}
            open={visible}
            onCancel={onCancel}
            onOk={handleOk}
            destroyOnClose // 使用 destroyOnClose 替代 destroyOnHidden
        >
            <Form form={form} layout="vertical">
                <Form.Item label="物料编码"><Input value={materialCode} disabled /></Form.Item>
                <Form.Item
                    name="version_suffix"
                    label="版本号后缀"
                    rules={[{ required: true, message: '请输入版本号后缀, 例如: 1.0' }]}
                    help="最终版本号将是: 物料编码_V(后缀)"
                >
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

export default VersionModal;