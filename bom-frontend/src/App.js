// src/App.js (确认已修改)
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { App as AntApp, Layout, Menu, Typography, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppstoreOutlined, SettingOutlined, DeleteOutlined, ToolOutlined } from '@ant-design/icons';
import MaterialList from './pages/MaterialList';
import SupplierList from './pages/SupplierList';
import UnitList from './pages/UnitList';
import VersionList from './pages/VersionList';
import RecycleBin from './pages/RecycleBin';
import DataCleanup from './pages/DataCleanup'; // 确认此行存在
import { setupInterceptors } from './api';

const { Header, Content, Sider } = Layout;
const { Title } = Typography;

const AppInitializer = ({ children }) => {
    const staticFunction = AntApp.useApp();
    useEffect(() => {
        setupInterceptors(staticFunction);
    }, [staticFunction]);
    return children;
};

const App = () => (
    <Router>
        <ConfigProvider locale={zhCN}>
            <AntApp>
                <AppInitializer>
                    <Layout style={{ minHeight: '100vh' }}>
                        <Sider collapsible>
                            <div style={{ height: '32px', margin: '16px', textAlign: 'center' }}>
                                <Title level={4} style={{ color: 'white', margin: 0, lineHeight: '32px' }}>BOM-WEB</Title>
                            </div>
                            <AppMenu />
                        </Sider>
                        <Layout>
                            <Header style={{ background: '#fff', padding: 0, display: 'flex', alignItems: 'center' }}>
                                <PageTitle />
                            </Header>
                            <Content style={{ margin: '0 16px' }}>
                                <div style={{ padding: 24, minHeight: 360, background: '#fff', marginTop: 16 }}>
                                    <Routes>
                                        <Route path="/" element={<MaterialList />} />
                                        <Route path="/materials" element={<MaterialList />} />
                                        <Route path="/versions" element={<VersionList />} />
                                        <Route path="/suppliers" element={<SupplierList />} />
                                        <Route path="/units" element={<UnitList />} />
                                        <Route path="/recycle-bin" element={<RecycleBin />} />
                                        <Route path="/cleanup" element={<DataCleanup />} /> {/* 确认此行存在 */}
                                    </Routes>
                                </div>
                            </Content>
                        </Layout>
                    </Layout>
                </AppInitializer>
            </AntApp>
        </ConfigProvider>
    </Router>
);

const AppMenu = () => {
    const location = useLocation();
    const items = [
        { key: 'main', icon: <AppstoreOutlined />, label: 'BOM管理', children: [
                { key: '/materials', label: <Link to="/materials">物料列表</Link> },
                { key: '/versions', label: <Link to="/versions">BOM版本列表</Link> },
            ]},
        { key: 'settings', icon: <SettingOutlined />, label: '基础数据', children: [
                { key: '/suppliers', label: <Link to="/suppliers">供应商管理</Link> },
                { key: '/units', label: <Link to="/units">单位管理</Link> },
            ]},
        { key: 'tools', icon: <ToolOutlined />, label: '系统工具', children: [
                { key: '/cleanup', label: <Link to="/cleanup">数据清理</Link> },
                { key: '/recycle-bin', label: <Link to="/recycle-bin">回收站</Link> },
            ]},
    ];
    const openKey = items.find(item => item.children?.some(child => child.key === location.pathname))?.key;
    return <Menu theme="dark" mode="inline" items={items} defaultOpenKeys={openKey ? [openKey] : []} selectedKeys={[location.pathname]} />;
};

const PageTitle = () => {
    const location = useLocation();
    let title = '物料列表';
    if (location.pathname.startsWith('/versions')) title = 'BOM版本列表';
    else if (location.pathname.startsWith('/suppliers')) title = '供应商管理';
    else if (location.pathname.startsWith('/units')) title = '单位管理';
    else if (location.pathname.startsWith('/recycle-bin')) title = '回收站';
    else if (location.pathname.startsWith('/cleanup')) title = '数据清理';
    return <h2 style={{ margin: '0 0 0 24px', lineHeight: '64px' }}>{title}</h2>;
};

export default App;