import subprocess, time, sys

tables = [
    'base_auth_msg', 'base_category', 'base_codeinfo', 'base_project',
    'base_qrcode_templates', 'base_table_data', 'base_tables', 'base_task',
    'code_state', 'code_state_log', 'code_task_log', 'cycle_plan', 'cycle_task',
    'cycle_task_entity_task', 'cycle_task_instance', 'record_review_data',
    'table_d16', 'table_d19', 'table_d22', 'table_d23', 'table_d24', 'table_d27',
    'table_d29', 'table_d3', 'table_d30', 'table_d32', 'table_d34', 'table_d6',
    'table_relation', 'template_codeinfo_d10', 'template_codeinfo_d12',
    'template_codeinfo_d14', 'template_codeinfo_d15', 'template_codeinfo_d25',
    'template_codeinfo_d28'
]

total = len(tables)
for i, table in enumerate(tables):
    print(f'{i+1}/{total} {table}...', flush=True)
    result = subprocess.run(
        ['python', r'C:\Users\Administrator\caoliao-feishu-connector-repo\sync_table.py', table],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        print(f'  FAILED: {result.stderr[:200]}', flush=True)
    else:
        print(f'  OK', flush=True)

print('All tables synced!')
