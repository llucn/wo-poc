Form Fields
===

# Tables

## Table 1: `t_field`

| Name          | Type         | Description    | Nullable | PK  | Index  |
|---------------|--------------|----------------|----------|-----|--------|
| id            | int          | auto increment | No       | Yes |        |
| name          | varchar(255) |                | No       |     | Unique |
| title         | varchar(255) |                | No       |     |        |
| description   | text         |                | Yes      |     |        |
| required      | int          | 0: No, 1: Yes  | No       |     |        |
| default_value | text         |                | Yes      |     |        |
| type          | varchar(64)  |                | No       |     |        |
| properties    | text         | JSON String    | Yes      |     |        |
| created_on    | timestamp    |                | No       |     |        |
| created_by    | varchar(255) |                | No       |     |        |
| updated_on    | timestamp    |                | Yes      |     |        |
| updated_by    | varchar(255) |                | Yes      |     |        |


- `type`: text-field, text-area, number, select, radio, checkbox, date, datetime, file
- `properties`: 
    - text-field: `{min_length: 0, max_length: 200}`
    - text-area: `{rows: 10}`
    - number: `{precision: 5, scale: 2}`
    - select: `{values: [{label: 'label', value: 'value'}]}`
    - radio: `{values: [{label: 'label', value: 'value'}]}`
    - checkbox: `{label: 'label'}`
    - date: `{format: 'yyyy-MM-dd'}`
    - datetime: `{format: 'yyyy-MM-dd HH:mm:ss'}`
    - file: `{types: ['jpeg', 'png', 'zip']}`

# Pages

## Page 1: All Fields

菜单入口: Settings -> Field

标题：All Fields

功能：以列表形式显示所有 Field，不分页

Head button:
- 添加按钮：文本 `+ Add`
- 删除按钮：文本 `- Delete`，删除时弹出提示框，文本：`Delete Fields?`

Table columns:
- Check Box
- ID: '#' + id
- Name
- Title
- Required

## Page 2: Field Detail

角色权限：ADMIN

标题：'Field #' + id

返回页面：All Fields

Head button：
- 编辑按钮：文本 `Edit`
- 删除按钮：文本 `- Delete`，删除时弹出提示框，文本：`Delete Field #id?`

显示内容：
- ID: '#' + id
- Name
- Title
- Description
- Required: 0: No, 1: Yes
- Default Value
- Type
- Properties
    - 显示与 Type 相关的属性

## Page 3: Add Field

角色权限：ADMIN

标题：Add Field

返回页面：All Fields

输入框：
- Name
- Title
- Description
- Required: 选择框（Yes, No）
- Default Value
- Type: 选择框（text-field, text-area, number, select, radio, checkbox, date, datetime, file）
- Properties: 选择 Type 显示对应的输入框

按钮：
- Save: Primary button
- Cancel: Secondary button, 点击返回 All Fields 页面

## Page4: Edit Field

角色权限：ADMIN

标题：'Edit Field #' + id

返回页面：Field Detail

输入框：
- ID: 初始化显示 '#' + id，不可编辑
- Name: 输入时检查重复，如果有重复提示错误
- Title
- Description
- Required: 选择框（Yes, No）
- Default Value
- Type: 选择框（text-field, text-area, number, select, radio, checkbox, date, datetime, file）
- Properties: 选择 Type 显示对应的输入框

按钮：
- Save: Primary button
- Cancel: Secondary button, 点击返回 Field Detail 页面
