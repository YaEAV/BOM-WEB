## BOM-WEB 项目说明文档

### 一、 安装部署说明

本说明用于指导系统管理员或运维人员如何在服务器上部署 BOM-WEB 项目。

#### 1. 系统要求

- **操作系统**: Linux (推荐) 或 Windows Server
    
- **运行时环境**: Node.js (推荐版本 v18.x 或更高版本)
    
- **数据库**: MySQL (推荐版本 5.7 或更高版本)
    
- **进程管理工具**: PM2 (推荐，用于在后台持续运行Node.js应用)
    

#### 2. 部署步骤

**第一步：获取代码**

将 `BOM-WEB` 整个文件夹上传到服务器的指定目录，例如 `/srv/www/bom-web`。

**第二步：配置后端服务 (`bom-backend`)**

1. **进入后端目录**:
    
    Bash
    
    ```
    cd /srv/www/bom-web/BOM-WEB/bom-backend
    ```
    
2. **安装依赖**: 使用 npm 安装所有必需的依赖包。
    
    Bash
    
    ```
    npm install
    ```
    
3. **配置环境变量**:
    
    - 在 `bom-backend` 目录下，创建一个名为 `.env` 的文件。
        
    - 根据您的实际数据库配置，填写以下内容:
        
        代码段
        
        ```
        # 数据库配置
        DB_HOST=localhost
        DB_PORT=3306
        DB_USER=your_database_user
        DB_PASSWORD=your_database_password
        DB_NAME=your_database_name
        
        # 服务器端口
        PORT=52026
        ```
        
    - **重要**: 请确保 MySQL 数据库已经创建，并且 `DB_NAME` 对应的数据库也已存在。您需要手动执行项目所需的 SQL 脚本来创建数据表（`materials`, `bom_versions`, `bom_lines`, `suppliers`, `units`, `material_drawings`等）。
        
4. **创建图纸上传目录**: 在`bom-backend`目录下，手动创建用于存放上传文件的文件夹。
    
    Bash
    
    ```
    mkdir -p uploads/drawings
    ```
    

**第三步：构建前端应用 (`bom-frontend`)**

1. **进入前端目录**:
    
    Bash
    
    ```
    cd /srv/www/bom-web/BOM-WEB/bom-frontend
    ```
    
2. **安装依赖**:
    
    Bash
    
    ```
    npm install
    ```
    
3. **执行构建**: 该命令会生成一个 `build` 文件夹，其中包含了优化后的静态网站文件。
    
    Bash
    
    ```
    npm run build
    ```
    

**第四步：启动服务和部署**

1. **启动后端服务**:
    
    - 进入后端目录: `cd /srv/www/bom-web/BOM-WEB/bom-backend`
        
    - 使用 PM2 启动后端服务，这能确保应用在后台稳定运行，并在崩溃后自动重启。
        
        Bash
        
        ```
        pm2 start server.js --name bom-backend
        ```
        
    - 您可以使用 `pm2 list` 查看服务状态，`pm2 logs bom-backend` 查看日志。
        
2. **配置Web服务器 (Nginx - 推荐)**:
    
    - 为了让用户能通过域名或IP地址访问前端页面，并让前端能正确请求到后端API，建议使用 Nginx 作为反向代理。
        
    - 以下是一个 Nginx 的配置示例 (保存到 `/etc/nginx/sites-available/bom-web.conf`):
        
        Nginx
        
        ```
        server {
            listen 80;
            server_name your_domain_or_ip; # 替换为您的域名或服务器IP
        
            # 前端静态文件服务
            location / {
                root /srv/www/bom-web/BOM-WEB/bom-frontend/build;
                try_files $uri /index.html;
            }
        
            # 后端 API 代理
            location /api/ {
                proxy_pass http://localhost:52026; # 代理到后端Node.js服务
                proxy_http_version 1.1;
                proxy_set_header Upgrade $http_upgrade;
                proxy_set_header Connection 'upgrade';
                proxy_set_header Host $host;
                proxy_cache_bypass $http_upgrade;
            }
        }
        ```
        
    - 创建软链接并重启 Nginx:
        
        Bash
        
        ```
        sudo ln -s /etc/nginx/sites-available/bom-web.conf /etc/nginx/sites-enabled/
        sudo nginx -t
        sudo systemctl restart nginx
        ```
        

部署完成后，用户即可通过 `http://your_domain_or_ip` 访问BOM管理系统。

---

### 二、 开发说明

本说明用于帮助新开发者快速了解项目结构，并在本地搭建开发环境。

#### 1. 项目技术栈

- **后端**: Node.js + Express.js
    
- **前端**: React + Ant Design (AntD)
    
- **数据库**: MariaDB
    
- **API通信**: Axios
    

#### 2. 本地开发环境搭建

1. **克隆/下载项目**: 获取 `BOM-WEB` 文件夹并放在您的开发目录中。
    
2. **配置后端**:
    
    - 进入后端目录: `cd BOM-WEB/bom-backend`
        
    - 安装依赖: `npm install`
        
    - 创建 `.env` 文件（参考上文“安装部署说明”中的步骤），并填入您的**本地MySQL数据库**的连接信息。
        
    - **重要**: 确保您的本地MySQL服务正在运行，并且相关的数据库和表已经创建。
        
    - 启动后端开发服务器:
        
        Bash
        
        ```
        npm run dev
        ```
        
        此命令使用 `nodemon` 启动服务，当代码文件发生变化时会自动重启服务。 服务将运行在 `http://localhost:52026`。
        
3. **配置前端**:
    
    - 打开一个新的终端窗口。
        
    - 进入前端目录: `cd BOM-WEB/bom-frontend`
        
    - 安装依赖: `npm install`
        
    - 启动前端开发服务器:
        
        Bash
        
        ```
        npm start
        ```
        
        此命令会启动一个开发服务器，并自动在浏览器中打开 `http://localhost:3000`。 前端页面会自动连接到本地正在运行的后端API。
        

现在，您已经成功在本地运行了整个项目，可以开始进行开发了。

#### 3. 项目结构简介

- **`bom-backend/`**: 后端代码目录
    
    - `server.js`: Express服务器的入口文件，负责启动服务、配置中间件（如CORS）和挂载路由。
        
    - `config/db.js`: 数据库连接池的配置文件。
        
    - `routes/`: API路由定义目录。每个文件对应一类资源，例如 `materials.js` 处理所有与物料相关的API请求。
        
    - `utils/`: 存放公共的辅助函数，如 `bomHelper.js` 用于处理BOM树形结构逻辑。
        
    - `uploads/`: （需手动创建）用于存放用户上传的图纸等文件。
        
- **`bom-frontend/`**: 前端代码目录
    
    - `src/`: 主要的源代码目录。
        
    - `src/index.js`: React应用的入口文件。
        
    - `src/App.js`: 应用的主组件，负责整体页面布局和路由配置。
        
    - `src/pages/`: 页面级组件目录。每个文件代表一个完整的功能页面，例如 `MaterialList.js` 是物料列表页，`BomManagerDrawer.js` 是BOM管理的抽屉界面。
        
    - `src/components/`: 可复用的UI组件目录，例如 `VersionModal.js` 是一个通用的版本编辑/新建弹窗。
        
    - `src/api/index.js`: 封装了 `axios` 客户端，是所有前端API请求的统一出口。