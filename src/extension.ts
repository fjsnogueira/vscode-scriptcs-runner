import * as vscode from 'vscode';
import * as child_process from 'child_process'
import * as fs from 'fs'

export function activate(context: vscode.ExtensionContext) {
  console.log('scriptcsRunner is now active!');

  var disposable = vscode.commands.registerCommand('extension.scriptcsRunner', () => {
    let parser = new ScriptParser(vscode.window.activeTextEditor);
    let text = parser.getScriptText();
    let config = vscode.workspace.getConfiguration('scriptcsRunner');
    let runner = new ScriptRunner(config.get<string>('scriptcsPath'), config.get<boolean>('debug'), process.platform == 'win32');
    let scriptMetaData = runner.getScriptMetadata(text);
    try {
      runner.runScript(scriptMetaData);
    } catch (e) {
      vscode.window.showErrorMessage('Couldn\'t execute the script.\n' + e);
    }
  });
}

class ScriptParser {
  private _textEditor: vscode.TextEditor;

  constructor(texteditor: vscode.TextEditor) {
    this._textEditor = texteditor;
  }

  public getScriptText(): string {
    let start = this._textEditor.selection.start;
    let end = this._textEditor.selection.end;

    if (start.compareTo(end) == 0) {
      return undefined;
    }

    let text = this._textEditor.document.getText(new vscode.Range(start, end));

    return text;
  }
}

class ScriptMetadata {
  public ScriptName : string;
  public FolderPath : string;
}

class ScriptRunner {
  private _tempScriptFolder: string;
  private _currentLocation: string;
  private _scriptcsPath: string;
  private _debug: boolean;
  private _pathSeparator: string;

  constructor(scriptcsPath: string, debug: boolean, isWindows: boolean) {
    this._pathSeparator = isWindows ? '\\' : '/';    
    this._currentLocation = vscode.window.activeTextEditor.document.fileName.substring(0, vscode.window.activeTextEditor.document.fileName.lastIndexOf(this._pathSeparator));
    this._tempScriptFolder = this._currentLocation + this._pathSeparator + '.script_temp' + this._pathSeparator;
    this._scriptcsPath = scriptcsPath;
    this._debug = debug;
  }

  public getScriptMetadata(text: string): ScriptMetadata {
    
    if (text == undefined) {
      return { ScriptName: vscode.window.activeTextEditor.document.fileName, FolderPath: this._currentLocation };
    }
    
    let filename = (Math.random() + 1).toString(36).substring(5) + '.csx';

    try {
      fs.mkdirSync(this._tempScriptFolder);
    } catch (e) {
      if (e.code != 'EEXIST') throw e;
    }
    fs.writeFileSync(this._tempScriptFolder + filename, text);

    return { ScriptName: filename, FolderPath: this._tempScriptFolder };
  }

  public runScript(scriptMetaData: ScriptMetadata): void {
    let args = ['-script', scriptMetaData.ScriptName];
    if (this._debug) {
      args.push('-debug');
    }
    let scriptcs = child_process.spawn(this._scriptcsPath, args, { cwd: scriptMetaData.FolderPath });
    var outputChannel = vscode.window.createOutputChannel('scriptcs');
    outputChannel.show();

    scriptcs.stdout.on('data', buffer => {
      console.log(buffer.toString());
      outputChannel.appendLine(buffer.toString());
    });

    scriptcs.on('close', () => {
      try {
        fs.readdirSync(this._tempScriptFolder).forEach(fileName => {
          fs.unlinkSync(this._tempScriptFolder + this._pathSeparator + fileName);
        });
        fs.rmdirSync(this._tempScriptFolder);
      } catch (e) {
        if (e.code != 'ENOENT') throw e;
      }
    });
  }
}