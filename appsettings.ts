import app = require("teem");
import fs = require("fs");

require("dotenv").config({ encoding: "utf8", path: app.currentDirectoryName() + "/../.env" });

export = {
	localIp: process.env.app_localIp as string,
    port: parseInt(process.env.app_port as string),
	root: process.env.app_root as string,
	urlSite: process.env.app_urlSite as string,
	cookie: process.env.app_cookie as string,
	cookieSecure: !!parseInt(process.env.app_cookieSecure as string),
	staticFilesDir: process.env.app_staticFilesDir as string,
	disableStaticFiles: !!parseInt(process.env.app_disableStaticFiles as string),

	sqlPool: {
		connectionLimit: parseInt(process.env.app_sqlPool_connectionLimit as string),
		waitForConnections: !!parseInt(process.env.app_sqlPool_waitForConnections as string),
		charset: process.env.app_sqlPool_charset as string,
		host: process.env.app_sqlPool_host as string,
		port: parseInt(process.env.app_sqlPool_port as string),
		user: process.env.app_sqlPool_user as string,
		password: process.env.app_sqlPool_password as string,
		database: process.env.app_sqlPool_database as string
	},

	milesight: {
		host: process.env.app_milesight_host as string,
		clientId: process.env.app_milesight_clientId as string,
		user: process.env.app_milesight_user as string,
		password: process.env.app_milesight_password as string,
	},
};
