function mock_payload(filename = "_docs_/ui_data.json")
    JSON.parse(read(filename, String))
end

function mock_graph(filename = "_docs_/ui_data.json")
    mock_payload(filename) |> validate_payload |> build_graph
end

function mock_registers(filename = "_docs_/ui_data.json")
    mock_payload(filename) |> validate_payload |> create_registers_from_nodes
end
