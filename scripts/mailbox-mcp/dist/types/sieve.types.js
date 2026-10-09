export class SieveError extends Error {
    code;
    command;
    serverResponse;
    constructor(message, code, command, serverResponse) {
        super(message);
        this.code = code;
        this.command = command;
        this.serverResponse = serverResponse;
        this.name = "SieveError";
    }
}
//# sourceMappingURL=sieve.types.js.map