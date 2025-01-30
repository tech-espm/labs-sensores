import app = require("teem");
import appsettings = require("./appsettings");
import Milesight = require("./models/milesight");

process.env.TZ = "UTC";

app.run({
	localIp: appsettings.localIp,
	port: appsettings.port,
	root: appsettings.root,
	staticRoot: "public",
	staticFilesDir: appsettings.staticFilesDir,
	disableStaticFiles: appsettings.disableStaticFiles,
	sqlConfig: appsettings.sqlConfig,

	onFinish: function () {
		const server = app.express.listen(app.port, app.localIp, function () {
			// https://pm2.keymetrics.io/docs/usage/signals-clean-restart/
			// pm2 start src/app.js --name sensores --kill-timeout 45000 --wait-ready --listen-timeout 25000
			if (process.send) {
				process.on("SIGINT", function() {
					server.close(function (err) {
						process.exit(err ? 1 : 0);
					});
				});
			}

			if (process.send)
				process.send("ready");

			Milesight.iniciar();

			console.log(`Servidor executando em ${app.localIp}:${app.port}`);
		});
	},
});
