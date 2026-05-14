Issue Category
===

## 表名称

t_issue_category

## 表结构

| Name         | Type         | Description    | Nullable | PK  | Index  |
|--------------|--------------|----------------|----------|-----|--------|
| id           | int          | auto increment | No       | Yes |        |
| name         | varchar(255) |                |          |     | Unique |
| display_name | varchar(255) |                |          |     | Unique |

## 菜单入口

Settings -> Issue Category

## 页面1: All Issue Categories

角色权限：ADMIN

标题：All Issue Categories

以列表形式显示所有 category，不分页。

Table head button:
- 添加按钮：文本 `+ Add`
- 删除按钮：文本 `- Delete`，删除是弹出提示框，文本：`Delete categories?`

Table columns:
- Check Box
- ID: '#' + id
- Name
- Display Name

## 页面2: Add Category

角色权限：ADMIN

标题：Add Category

标题左侧显示返回按钮，按钮无边框，按钮图标左箭头，点击按钮回到 "All Issue Categories" 页面。

输入框：
- Name: 输入时检查重复，如果有重复提示错误。输入格式：kebab-case。
- Display Name: 输入时检查重复，如果有重复提示错误

按钮：
- Save: primary button
- Cancel: secondary button, 点击返回 All Issue Categories 页面

## 页面3：Category Detail

角色权限：ADMIN

标题：name

标题左侧显示返回按钮，按钮无边框，按钮图标左箭头，点击按钮回到 "All Issue Categories" 页面。

显示内容：
- ID: '#' + id
- Name: name
- Display Name: displayName

按钮：
- Edit：转到 Edit Category 页面

## 页面4：Edit Category

角色权限：ADMIN

标题：Edit Category

标题左侧显示返回按钮，按钮无边框，按钮图标左箭头，点击按钮回到 "Category Detail" 页面。

输入框：
- ID: 初始化显示 '#' + id，不可编辑
- Name: 初始化显示 name，不可编辑，
- Display Name: 初始化显示 displayName，输入时检查重复，如果有重复提示错误

按钮：
- Save: primary button
- Cancel: secondary button, 点击返回 Category Detail 页面
