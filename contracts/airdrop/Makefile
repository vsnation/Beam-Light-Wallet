# Airdrop Contract - Build Configuration
# BEAM Privacy Blockchain Smart Contract
#
# Prerequisites:
# 1. LLVM/Clang with WebAssembly target
# 2. BEAM shader headers from: https://github.com/BeamMW/beam/tree/master/bvm/Shaders
#
# Install on macOS:
#   brew install llvm
#   export PATH="/opt/homebrew/opt/llvm/bin:$PATH"
#
# Setup BEAM headers:
#   git clone https://github.com/BeamMW/beam.git --depth 1
#   export BEAM_SHADERS=/path/to/beam/bvm/Shaders

# Configuration
CLANG ?= clang
BEAM_SHADERS ?= $(HOME)/beam/bvm/Shaders

# Compiler flags for WebAssembly
# BEAM BVM only supports mutable-globals and sign-ext features
CFLAGS = -O3 \
         --target=wasm32 \
         -I$(BEAM_SHADERS) \
         -Wl,--export-dynamic,--no-entry,--allow-undefined \
         -nostdlib \
         -fno-exceptions \
         -fno-rtti \
         -mno-bulk-memory \
         -mno-reference-types \
         -mno-multivalue \
         -mno-nontrapping-fptoint \
         -Xclang -target-feature -Xclang -bulk-memory-opt \
         -Xclang -target-feature -Xclang -call-indirect-overlong

# Output files
CONTRACT = contract.wasm
APP = app.wasm

# Source files
CONTRACT_SRC = contract.cpp
APP_SRC = app.cpp

# Shader output directory
SHADER_DIR = ../../shaders

.PHONY: all clean check-env help install

all: check-env $(CONTRACT) $(APP)

# Check that BEAM shader headers exist
check-env:
	@if [ ! -f "$(BEAM_SHADERS)/common.h" ]; then \
		echo "Error: BEAM shader headers not found!"; \
		echo ""; \
		echo "Please download BEAM shader headers:"; \
		echo "  git clone https://github.com/BeamMW/beam.git --depth 1"; \
		echo "  export BEAM_SHADERS=/path/to/beam/bvm/Shaders"; \
		echo ""; \
		echo "Or set BEAM_SHADERS when running make:"; \
		echo "  make BEAM_SHADERS=/path/to/beam/bvm/Shaders"; \
		exit 1; \
	fi
	@echo "BEAM shaders found at: $(BEAM_SHADERS)"

# Build contract shader (runs on validators)
$(CONTRACT): $(CONTRACT_SRC) contract.h
	@echo "Building contract shader..."
	$(CLANG) $(CFLAGS) -o $@ $(CONTRACT_SRC)
	@echo "Built: $@ ($(shell wc -c < $@ | tr -d ' ') bytes)"

# Build app shader (runs on client)
$(APP): $(APP_SRC) contract.h
	@echo "Building app shader..."
	$(CLANG) $(CFLAGS) -o $@ $(APP_SRC)
	@echo "Built: $@ ($(shell wc -c < $@ | tr -d ' ') bytes)"

# Copy compiled shaders to the shaders directory
install: all
	@mkdir -p $(SHADER_DIR)
	cp $(APP) $(SHADER_DIR)/airdrop_app.wasm
	cp $(CONTRACT) $(SHADER_DIR)/airdrop_contract.wasm
	@echo "Installed shaders to $(SHADER_DIR)/"

clean:
	rm -f $(CONTRACT) $(APP)

help:
	@echo "Airdrop Contract Build System"
	@echo ""
	@echo "Usage:"
	@echo "  make              - Build all shaders"
	@echo "  make install      - Build and copy to shaders/"
	@echo "  make contract.wasm - Build contract shader only"
	@echo "  make app.wasm     - Build app shader only"
	@echo "  make clean        - Remove built files"
	@echo "  make help         - Show this help"
	@echo ""
	@echo "Configuration:"
	@echo "  BEAM_SHADERS - Path to BEAM shader headers (default: ~/beam/bvm/Shaders)"
	@echo "  CLANG        - Clang compiler path (default: clang)"
	@echo ""
	@echo "Example:"
	@echo "  make BEAM_SHADERS=/opt/beam/bvm/Shaders"
	@echo "  make install"
