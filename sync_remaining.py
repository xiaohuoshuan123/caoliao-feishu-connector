import subprocess, time, sys

# Continue from where it stopped
tables = [
    'table_d19', 'table_d22', 'table_d23', 'table_d24', 'table_d27',
    'table_d29', 'table_d3', 'table_d30', 'table_d32', 'table_d34', 'table_d6',
    'table_relation', 'template_codeinfo_d10', 'template_codeinfo_d12',
    'template_codeinfo_d14', 'template_codeinfo_d15', 'template_codeinfo_d25',
    'template_codeinfo_d28',
    # Retry failed ones
    'base_task', 'base_table_data', 'code_state_log', 'code_task_log',
    'cycle_task_entity_task', 'table_d16'
]

total = len(tables)
for i, table in enumerate(tables):
    print(f'{i+1}/{total} {table}...', flush=True)
    result = subprocess.run(
        ['python', r'C:\Users\Administrator\caoliao-feishu-connector-repo\sync_table.py', table],
        capture_output=True, text=True, timeout=180
    )
    print(f'  returncode={result.returncode}', flush=True)

print('All done!')
