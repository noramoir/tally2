.PHONY: run validate

run:
	npx serve .

validate:
	npm install --no-save @babel/parser htmlhint
	@errors=0; \
	for file in $$(find . -name '*.js' -not -path '*/node_modules/*'); do \
		if node --check "$$file" 2>/dev/null; then \
			echo "✓ $$file"; \
		else \
			if node -e " \
				const fs = require('fs'); \
				const { parse } = require('@babel/parser'); \
				const code = fs.readFileSync('$$file', 'utf8'); \
				parse(code, { sourceType: 'script', plugins: ['jsx'] }); \
			" 2>&1; then \
				echo "✓ $$file (JSX)"; \
			else \
				echo "✗ $$file"; \
				errors=$$((errors + 1)); \
			fi; \
		fi; \
	done; \
	if [ $$errors -ne 0 ]; then \
		echo "Found syntax errors in $$errors file(s)"; \
		exit 1; \
	fi; \
	echo "All JS files passed syntax check"
	npx htmlhint '**/*.html' --ignore 'node_modules/**'
