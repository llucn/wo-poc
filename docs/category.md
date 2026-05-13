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

输入框：
- Name: 输入时检查重复，如果有重复提示错误
- Display Name: 输入时检查重复，如果有重复提示错误

按钮：
- Save: primary button
- Cancel: secondary button, 点击返回 All Issue Categories 页面
