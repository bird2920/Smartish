build: clean
	npm run build
dist:
	mkdir dist
deploy: build
	npx wrangler deploy
	@echo "Deployment complete!"
validate-firebase: build
	node validate-firebase.js
.PHONY: build dist deploy validate-firebase clean
clean:
	rm -rf dist
