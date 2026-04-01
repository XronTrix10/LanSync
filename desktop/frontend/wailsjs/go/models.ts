export namespace main {
	
	export class DeviceIdentity {
	    ip: string;
	    deviceName: string;
	    os: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new DeviceIdentity(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ip = source["ip"];
	        this.deviceName = source["deviceName"];
	        this.os = source["os"];
	        this.type = source["type"];
	    }
	}

}

