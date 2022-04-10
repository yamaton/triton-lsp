import chai from "chai";
import { Duplex } from 'stream';

import {
  Connection, createConnection,
  InitializeRequest, InitializeResult, InitializeParams,
  DidChangeConfigurationNotification
} from 'vscode-languageserver/node'


const assert = chai.assert;


class TestStream extends Duplex {
  _write(chunk: string, _encoding: string, done: () => void) {
    this.emit('data', chunk);
    done();
  }

  _read(_size: number) {
  }
}

describe('Server Tests', () => {
  let serverConnection: Connection;
  let clientConnection: Connection;
  const up = new TestStream();
  const down = new TestStream();
  serverConnection = createConnection(up, down);
  clientConnection = createConnection(down, up);
  serverConnection.listen();
  clientConnection.listen();

  it('hello', (done) => {
    done();
  });

});
