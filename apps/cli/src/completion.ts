/** Top-level ctrl-f5 commands for shell tab-completion. */
export const CLI_COMMANDS = [
  'start',
  'stop',
  'status',
  'health',
  'demo',
  'chat',
  'backup',
  'pair',
  'completion',
] as const;

export type CompletionShell = 'bash' | 'powershell';

const FLAGS = '--url --port --host --token --label --passphrase --workspace';

/** Print installable completion scripts for bash or PowerShell. */
export function completionScript(shell: CompletionShell): string {
  const cmds = CLI_COMMANDS.join(' ');
  if (shell === 'bash') {
    return [
      '# ctrl-f5 bash completion',
      '# Install: eval "$(ctrl-f5 completion bash)"',
      '# Or: ctrl-f5 completion bash > /etc/bash_completion.d/ctrl-f5',
      '',
      '_ctrl_f5() {',
      '  local cur prev',
      '  COMPREPLY=()',
      '  cur="${COMP_WORDS[COMP_CWORD]}"',
      '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
      '',
      '  if [[ ${COMP_CWORD} -eq 1 ]]; then',
      `    COMPREPLY=( $(compgen -W "${cmds}" -- "$cur") )`,
      '    return 0',
      '  fi',
      '',
      '  case "${COMP_WORDS[1]}" in',
      '    completion)',
      '      COMPREPLY=( $(compgen -W "bash powershell" -- "$cur") )',
      '      ;;',
      '    backup)',
      '      if [[ ${COMP_CWORD} -eq 2 ]]; then',
      '        COMPREPLY=( $(compgen -W "list create restore" -- "$cur") )',
      '      else',
      `        COMPREPLY=( $(compgen -W "${FLAGS}" -- "$cur") )`,
      '      fi',
      '      ;;',
      '    *)',
      '      case "$prev" in',
      '        --url|--port|--host|--token|--label|--passphrase|--workspace)',
      '          COMPREPLY=()',
      '          ;;',
      '        *)',
      `          COMPREPLY=( $(compgen -W "${FLAGS}" -- "$cur") )`,
      '          ;;',
      '      esac',
      '      ;;',
      '  esac',
      '}',
      '',
      'complete -F _ctrl_f5 ctrl-f5',
      '',
    ].join('\n');
  }

  const cmdList = CLI_COMMANDS.map((c) => `'${c}'`).join(', ');
  return [
    '# ctrl-f5 PowerShell completion',
    '# Install (current session):',
    '#   ctrl-f5 completion powershell | Out-String | Invoke-Expression',
    '# Persist: add the above to your $PROFILE',
    '',
    'Register-ArgumentCompleter -Native -CommandName ctrl-f5 -ScriptBlock {',
    '  param($wordToComplete, $commandAst, $cursorPosition)',
    `  $cmds = @(${cmdList})`,
    "  $flags = @('--url', '--port', '--host', '--token', '--label', '--passphrase', '--workspace')",
    '  $elements = @($commandAst.CommandElements)',
    '  if ($elements.Count -le 2) {',
    '    $cmds | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {',
    "      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)",
    '    }',
    '    return',
    '  }',
    '  $sub = $elements[1].Extent.Text',
    "  if ($sub -eq 'completion') {",
    "    @('bash', 'powershell') | Where-Object { $_ -like \"$wordToComplete*\" } | ForEach-Object {",
    "      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)",
    '    }',
    '    return',
    '  }',
    "  if ($sub -eq 'backup' -and $elements.Count -le 3) {",
    "    @('list', 'create', 'restore') | Where-Object { $_ -like \"$wordToComplete*\" } | ForEach-Object {",
    "      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)",
    '    }',
    '    return',
    '  }',
    '  $flags | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {',
    "    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)",
    '  }',
    '}',
    '',
  ].join('\n');
}

export function parseCompletionShell(raw: string | undefined): CompletionShell {
  const value = (raw ?? '').toLowerCase();
  if (value === 'bash' || value === 'powershell') {
    return value;
  }
  throw new Error('usage: ctrl-f5 completion bash|powershell');
}
