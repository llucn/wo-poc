Drag & Drop Form Csutomization
===

# Tables

## Table 1: `t_form`

| Name          | Type         | Description    | Nullable | PK  | Index  |
|---------------|--------------|----------------|----------|-----|--------|
| id            | int          | auto increment | No       | Yes |        |
| name          | varchar(255) |                | No       |     | Unique |
| description   | text         |                | Yes      |     |        |
| created_on    | timestamp    |                | No       |     |        |
| created_by    | varchar(255) |                | No       |     |        |
| updated_on    | timestamp    |                | Yes      |     |        |
| updated_by    | varchar(255) |                | Yes      |     |        |

## Table 2: `t_form_field`

| Name          | Type         | Description    | Nullable | PK  | Index  |
|---------------|--------------|----------------|----------|-----|--------|
| form_id       | int          |                | No       | Yes |        |
| field_id      | int          |                | No       | Yes |        |
| position      | int          |                | No       |     |        |
| created_on    | timestamp    |                | No       |     |        |
| created_by    | varchar(255) |                | No       |     |        |
| updated_on    | timestamp    |                | Yes      |     |        |
| updated_by    | varchar(255) |                | Yes      |     |        |

# Pages

## Page 1: All Forms

菜单入口: Settings -> Form

标题：All Forms

功能：以列表形式显示所有 Form，不分页

Head button:
- 添加按钮：文本 `+ Add`
- 删除按钮：文本 `- Delete`，删除时弹出提示框，文本：`Delete Forms?`

Table columns:
- Check Box
- ID: '#' + id
- Name
- Description: 如果字符长度大于 100，显示前 100个字符并且添加 `...` 标识
- Action: 显示 `Design` 连接

## Page 2: Form Detail

角色权限：ADMIN

标题：'Form #' + id

返回页面：All Forms

Head button：
- 编辑按钮：文本 `Edit`
- 删除按钮：文本 `- Delete`，删除时弹出提示框，文本：`Delete Form #id?`

显示内容：
- ID: '#' + id
- Name
- Description

Tail button:
- Design

## Page 3: Add Form

角色权限：ADMIN

标题：Add Form

返回页面：All Forms

输入框：
- Name：输入时检查重复，如果有重复提示错误
- Description

按钮：
- Save: Primary button
- Save & Design: Primary button
- Cancel: Secondary button, 点击返回 All Forms 页面

## Page 4: Edit Form

角色权限：ADMIN

标题：'Edit Form #' + id

返回页面：Form Detail

输入框：
- ID: 初始化显示 '#' + id，不可编辑
- Name: 输入时检查重复，如果有重复提示错误
- Description

按钮：
- Save: Primary button
- Save & Design: Primary button
- Cancel: Secondary button, 点击返回 Form Detail 页面

## Page 5: Design Form

角色权限：ADMIN

标题：'Design Form #' + id

返回页面：
- All Forms: 来自 All Forms
- Form Detail：来自 Edit Form、Add Form、Form Detail

Head button:
- 添加按钮：文本 `+ Add`, 点击弹窗 "Select Field" Page

列表行可以 Drag & Drop 拖动，Table Columns：
- Drag Handler：抓动图标，可以抓住这个图标移动列表行
- Position: 显示顺序，就是列表顺序
- ID: '#' + id
- Name
- Delete: 回收站图标，点击除去当前行

所有修改都是暂时的，不保存

按钮：
- Save: Primary button, 保存所有更改，然后跳转到 All Forms 页面
- Cancel: Secondary button, 点击返回，返回位置与标题返回按钮相同

## Page 6: Select Field

这是一个弹窗页面，标题：Select Field

显示内容：
- Select Box: 显示所有 Field，文本 `#${id} - ${name}`，按照 id 排序，初始空值
- 文本框：选中某个 Field 之后，显示与 Field 相关的 Description
- Select 按钮：把选中的 Field 添加到列表末尾。如果 Field 已存在不做任何事情
- Cancel 按钮：关闭弹窗
